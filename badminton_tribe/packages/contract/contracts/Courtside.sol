// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { IERC20Metadata } from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { ReentrancyGuard } from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol"; // 引入权限控制
import { ICourtside } from "./ICourtside.sol";

contract Courtside is ICourtside, ReentrancyGuard, Ownable {
    using SafeERC20 for IERC20;

    // 状态变量
    uint256 public nextEventId;
    uint256 public constant CHALLENGE_DURATION = 10 minutes;
    uint8 public constant CHALLENGE_FEE_RATE = 5; // 对支付结算发起挑战的押金为人均费用的5%

    mapping(uint256 => ActivityConfig) public events;
    mapping(uint256 => EventStatus) public eventStatus;
    // 记录付款成功的参与人信息
    mapping(uint256 => mapping(address => PlayerInfo)) public players;
    // 记录成功加入活动(即申请被批准)的参与人
    mapping(uint256 => address[]) public eventPlayers;
    
    // 结算信息
    struct SettlementInfo {
        uint256 totalExpense;
        uint256 challengeEndTime;
        bool settled;
        bool isDisputed; // 用于标记争议状态
    }
    mapping(uint256 => SettlementInfo) public settlements;

    // 记录每个地址在每个活动中可提取的资金余额: EventID => UserAddress => Amount
    mapping(uint256 => mapping(address => uint256)) public withdrawableFunds;
    
    // Supported tokens whitelist
    mapping(address => bool) public supportedTokens;

    // --- Modifiers ---

    modifier onlyHost(uint256 eventId) {
        require(msg.sender == events[eventId].host, "Caller is not the host");
        _;
    }

    modifier inStatus(uint256 eventId, EventStatus status) {
        require(eventStatus[eventId] == status, "Invalid event status");
        _;
    }

    // --- Constructor ---

    constructor() Ownable(msg.sender) {
        nextEventId = 1;
    }
    
    // Set supported token (only owner)
    function setSupportedToken(address token, bool status) external onlyOwner {
        supportedTokens[token] = status;
    }

    // --- External Functions ---
    // 创建活动
    function createEvent(CreateEventInput calldata input) external override returns (uint256) {
        require(bytes(input.name).length > 0, "Name required");
        require(input.startTime > block.timestamp,// && input.startTime - block.timestamp >= 12 hours, 
            "Start time must be in future, and at least 12 hours later");
        require(input.duration >= 3600, "Duration less than 1 hour");
        require(input.maxPlayers >= input.minPlayers 
            && input.minPlayers >= 2
            && input.maxPlayers <= input.duration * 4 / 1 hours
            && input.maxPlayers <= 20, 
            "Max < Min players, minimum player number less than 2, maximum player number four times than the duration or more than 20");
        require(input.minLevelMale >= 10 && input.minLevelFemale >= 10 && input.minLevelMale <= 100 
            && input.minLevelMale <= 100, "MinLevel should be between 10 and 100");
        require(input.tokenAddress != address(0), "Invalid token");
        require(supportedTokens[input.tokenAddress], "Token not supported");

        uint256 eventId = nextEventId++;

        // Fetch decimals from token contract
        uint8 decimals = IERC20Metadata(input.tokenAddress).decimals();

        events[eventId] = ActivityConfig({
            name: input.name,
            description: input.description,
            location: input.location,
            startTime: input.startTime,
            duration: input.duration,
            host: msg.sender,
            tokenAddress: input.tokenAddress,
            tokenDecimals: decimals,
            feePerPerson: input.feePerPerson,
            maxPlayers: input.maxPlayers,
            minPlayers: input.minPlayers,
            minLevelMale: input.minLevelMale,
            minLevelFemale: input.minLevelFemale
        });
        
        eventStatus[eventId] = EventStatus.Open;

        emit EventCreated(eventId, msg.sender, input.name, block.timestamp);
        return eventId;
    }

    function joinEvent(uint256 eventId) external override nonReentrant inStatus(eventId, EventStatus.Open) {
        ActivityConfig storage evt = events[eventId];
        // require(eventStatus[eventId] == EventStatus.Open, "Event not open");
        require(eventPlayers[eventId].length < evt.maxPlayers, "Event full");
        require(!players[eventId][msg.sender].hasPaid, "Already paid");

        // 活动参与人付款
        if (evt.feePerPerson > 0) {
            IERC20(evt.tokenAddress).safeTransferFrom(msg.sender, address(this), evt.feePerPerson);
        }

        // 记录参与人信息
        players[eventId][msg.sender] = PlayerInfo({
            wallet: msg.sender,
            hasPaid: true,
            isApproved: false, // Wait for host approval
            isCheckedIn: false,
            refundAmount: 0
        });
        eventPlayers[eventId].push(msg.sender);

        // 检查是否满员, 满员则修改活动状态; 暂不考虑候补
        if (eventPlayers[eventId].length >= evt.maxPlayers) {
             eventStatus[eventId] = EventStatus.Full;
        }

        emit PlayerJoined(eventId, msg.sender, block.timestamp);
    }

    // 撤回申请, 暂时只支持host审批前撤回, 如果已批准不允许鸽
    function withdrawApplication(uint256 eventId) external override nonReentrant {
        // 检查活动状态
        require(eventStatus[eventId] == EventStatus.Open || eventStatus[eventId] == EventStatus.Full, "Cannot withdraw now");
        
        PlayerInfo storage p = players[eventId][msg.sender];
        require(p.hasPaid, "Not joined");
        require(!p.isApproved, "Already approved");

        // Refund
        uint256 fee = events[eventId].feePerPerson;
        p.hasPaid = false;
        if (fee > 0) {
            IERC20(events[eventId].tokenAddress).safeTransfer(msg.sender, fee);
        }
        
        // Remove from array (Swap and pop for gas efficiency)
        _removePlayer(eventId, msg.sender);

        // 如果本来活动已满员则更新活动状态
        if (eventStatus[eventId] == EventStatus.Full) {
            eventStatus[eventId] = EventStatus.Open;
        }

        emit ApplicationWithdrawn(eventId, msg.sender, block.timestamp);
    }

    // 批准参加活动申请
    function approvePlayer(uint256 eventId, address player) external override onlyHost(eventId) {
        require(eventStatus[eventId] == EventStatus.Open || eventStatus[eventId] == EventStatus.Full, "Event not open");
        PlayerInfo storage p = players[eventId][player];
        require(p.hasPaid, "Player not found");
        require(!p.isApproved, "Already approved");

        p.isApproved = true;
        emit PlayerApproved(eventId, player, block.timestamp);
    }

    // 批量批准玩家
    function batchApprovePlayers(uint256 eventId, address[] calldata playersToApprove) external onlyHost(eventId) {
        require(eventStatus[eventId] == EventStatus.Open || eventStatus[eventId] == EventStatus.Full, "Event not open");
        
        for (uint256 i = 0; i < playersToApprove.length; i++) {
            address player = playersToApprove[i];
            PlayerInfo storage p = players[eventId][player];
            
            // 只有未批准且已付款的才处理，避免重复 Revert
            if (p.hasPaid && !p.isApproved) {
                p.isApproved = true;
                emit PlayerApproved(eventId, player, block.timestamp);
            }
        }
    }

    // 拒绝玩家申请
    // 拒绝后，资金退回至 withdrawableFunds 供用户提取，玩家从列表移除
    function rejectPlayer(uint256 eventId, address player) external onlyHost(eventId) nonReentrant {
        // 1. 检查活动状态：只有在报名阶段才能拒绝
        require(eventStatus[eventId] == EventStatus.Open || eventStatus[eventId] == EventStatus.Full, "Cannot reject now");
        
        PlayerInfo storage p = players[eventId][player];
        require(p.hasPaid, "Player not found or not paid");
        require(!p.isApproved, "Cannot reject approved player"); // 已批准的不能直接拒绝（需用踢出逻辑，本MVP暂不涉及）

        // 2. 处理退款 (采用 Pull Pattern 防止 DoS 攻击)
        // 如果直接 transfer，恶意用户可以通过合约拒绝收款来阻止 Host 拒绝他
        uint256 fee = events[eventId].feePerPerson;
        p.hasPaid = false;     // 标记为未付款/已失效
        p.refundAmount = fee;  // 记录应退金额用于前端显示
        
        if (fee > 0) {
            withdrawableFunds[eventId][player] += fee; // 资金进入待提取池
        }

        // 3. 从参与者数组中移除
        _removePlayer(eventId, player);

        // 4. 维护活动状态
        // 如果之前是满员状态，现在踢了一个人，应该变回 Open，允许其他人报名
        if (eventStatus[eventId] == EventStatus.Full) {
            eventStatus[eventId] = EventStatus.Open;
        }

        emit PlayerRejected(eventId, player, block.timestamp);
    }

    // 取消活动
    function cancelEvent(uint256 eventId) external override nonReentrant onlyHost(eventId) {
        ActivityConfig storage evt = events[eventId];
        EventStatus currentStatus = eventStatus[eventId];
        
        require(
            currentStatus == EventStatus.Open || currentStatus == EventStatus.Full || currentStatus == EventStatus.Draft,
            "Cannot cancel in current event status"
        );
        // 限制取消活动需在活动在开始前
        // bool beforeBegin = block.timestamp < evt.startTime; 
        // require(beforeBegin, "Event can only be canceled before it starts"); 

        eventStatus[eventId] = EventStatus.Cancelled;
        
        // Pull Pattern
        address[] memory attendees = eventPlayers[eventId];
        uint256 fee = evt.feePerPerson;
        
        // 移除 token 实例定义，因为循环内不再直接转账
        // IERC20 token = IERC20(evt.tokenAddress); 

        for (uint256 i = 0; i < attendees.length; i++) {
            address pAddr = attendees[i];
            PlayerInfo storage p = players[eventId][pAddr];
            if (p.hasPaid) {
                p.hasPaid = false;
                p.refundAmount = fee; // 记录退款金额
                
                if (fee > 0) {
                    // 不直接转账，而是增加可提取余额，这样即使某个地址是恶意的，也不会阻塞循环继续执行
                    withdrawableFunds[eventId][pAddr] += fee; 
                }
            }
        }

        bool isBelowMinNum = eventPlayers[eventId].length < evt.minPlayers;
        emit EventCancelled(eventId, isBelowMinNum ? "Attendees less than minimum number" : "Host cancelled", block.timestamp);
    }

    // 支付结算
    function settlePayment(uint256 eventId, uint256 totalExpense/*, string calldata proofHash*/) external override onlyHost(eventId) nonReentrant {
        // 检查活动状态, 假定只有在活动未取消且未结算时, host才能发起支付结算
        require(eventStatus[eventId] != EventStatus.Cancelled && eventStatus[eventId] != EventStatus.Completed, "Invalid status");
        
        if (settlements[eventId].challengeEndTime != 0) {
            revert("Settlement already initiated");
        }

        // 调用通用退款计算函数
        // todo: 后续可考虑支持手动调整金额, 例如调整男女成员的球费, 鸽子不算球费
        (uint256 confirmedCount, uint256 refundPerPlayer, ) = _calculateRefundValues(eventId, totalExpense);

        require(confirmedCount > 0, "No confirmed players");

        uint256 totalCollected = confirmedCount * events[eventId].feePerPerson;
        require(totalExpense <= totalCollected, "Expense > Collected");

        settlements[eventId] = SettlementInfo({
            totalExpense: totalExpense,
            challengeEndTime: block.timestamp + CHALLENGE_DURATION,
            settled: false,
            isDisputed: false
        });

        eventStatus[eventId] = EventStatus.Settling;

        emit SettlementInitiated(eventId, totalExpense, refundPerPlayer, block.timestamp, settlements[eventId].challengeEndTime);
    }

    // 结算争议处理
    function challengeSettlement(uint256 eventId) external payable override {
        require(eventStatus[eventId] == EventStatus.Settling, "Not in settling phase");
        require(block.timestamp < settlements[eventId].challengeEndTime, "Challenge period over");
        
        // 强制要求质押资金才能挑战，防止恶意 DOS 攻击
        uint256 challengeFee = events[eventId].feePerPerson * CHALLENGE_FEE_RATE / 100;
        require(msg.value >= challengeFee, "Must stake challengeFee(5% of feePerPerson) to challenge");

        // 标记为争议状态
        settlements[eventId].isDisputed = true;

        emit SettlementChallenge(eventId, msg.sender, block.timestamp);
    }

    /**
     * @notice 管理员解决争议，解锁资金
     * @param eventId 活动ID
     * @param finalExpense 裁决后的最终有效支出
     * @param challengerWin 挑战者是否获胜（获胜则退还押金，否则没收）
     * @param challenger 挑战者的地址（用于退押金）
     */
    function resolveDispute(
        uint256 eventId, 
        uint256 finalExpense, 
        bool challengerWin, 
        address payable challenger
    ) external onlyOwner {
        SettlementInfo storage settlement = settlements[eventId];
        
        require(settlement.isDisputed, "Event not disputed");
        require(eventStatus[eventId] == EventStatus.Settling, "Invalid status");

        // 1. 修正支出金额（如果 Host 虚报，Admin 可在此修正）
        settlement.totalExpense = finalExpense;

        // 2. 解除争议状态 [解决死锁的关键]
        settlement.isDisputed = false;

        // 3. 立即结束挑战期，允许 Host 马上调用 finalizeSettlement
        settlement.challengeEndTime = block.timestamp;

        // 4. 处理押金 (简单的激励逻辑)
        uint256 challengeFee = events[eventId].feePerPerson * CHALLENGE_FEE_RATE / 100;
        if (challengerWin) {
            // 挑战成功，退还押金
            (bool sent, ) = challenger.call{value: challengeFee}("");
            require(sent, "Failed to send Ether");
        } else {
            // 挑战失败，押金没收给平台（转给 Owner）
            (bool sent, ) = msg.sender.call{value: challengeFee}("");
            require(sent, "Failed to send Ether");
        }
        
        emit DisputeResolved(eventId, finalExpense, challengerWin);
    }

    // 支付结算, 只计算金额不进行转账 (Pull Pattern)，解决 Gas 循环限制和 DoS 攻击风险
    function finalizeSettlement(uint256 eventId) external override nonReentrant {
        require(eventStatus[eventId] == EventStatus.Settling, "Not in settling phase");
        
        SettlementInfo storage settlement = settlements[eventId];
        require(block.timestamp >= settlement.challengeEndTime, "Challenge period active");
        require(!settlement.isDisputed, "Event is under dispute"); // 争议期间锁死
        require(!settlement.settled, "Already settled");

        settlement.settled = true;
        eventStatus[eventId] = EventStatus.Completed;

        ActivityConfig storage evt = events[eventId];

        // 1. 结算 Host 的费用 (记入账本，不直接转账)
        if (settlement.totalExpense > 0) {
            withdrawableFunds[eventId][evt.host] += settlement.totalExpense;
        }

        // 调用通用计算函数。注意：这里使用的是存储在 settlement 中的最终 totalExpense
        (uint256 confirmedCount, uint256 refundPerPlayer, uint256 surplus) = _calculateRefundValues(eventId, settlement.totalExpense);

        // 2. 批量更新玩家账本
        address[] memory _players = eventPlayers[eventId]; // 获取列表用于遍历更新

        for (uint256 i = 0; i < _players.length; i++) {
            address playerAddr = _players[i];
            PlayerInfo storage p = players[eventId][playerAddr];

            if (p.isApproved) {
                // 已批准玩家：获得退款（如果有）
                if (refundPerPlayer > 0) {
                    p.refundAmount = refundPerPlayer;
                    withdrawableFunds[eventId][playerAddr] += refundPerPlayer;
                }
            } else {
                // 未批准玩家（遗留）：全额退款
                if (p.hasPaid) {
                    p.hasPaid = false; 
                    uint256 fullFee = evt.feePerPerson;
                    p.refundAmount = fullFee;
                    withdrawableFunds[eventId][playerAddr] += fullFee;
                }
            }
        }

        if (confirmedCount > 0) {
            // 计算余数
            uint256 dust = surplus % confirmedCount;
            if (dust > 0) {
                // 将余数给 Host (或者给平台 owner)
                withdrawableFunds[eventId][evt.host] += dust;
            }
        }

        emit FundsDistributed(eventId, settlement.totalExpense, surplus);
    }

    // 用户（Host 或 Player）提取退款
    function claimFunds(uint256 eventId) external nonReentrant {
        uint256 amount = withdrawableFunds[eventId][msg.sender];
        require(amount > 0, "No funds to claim");

        // Checks-Effects-Interactions 模式：先清零，再转账
        withdrawableFunds[eventId][msg.sender] = 0;

        IERC20 token = IERC20(events[eventId].tokenAddress);
        token.safeTransfer(msg.sender, amount);
        
        // 记录提取退款事件
        // emit FundsClaimed(eventId, msg.sender, amount);
    }

    function submitRating(uint256 eventId, address target, uint8 score) external override {
        // 后续可增加校验, 打分人及被评价人均需现场参加过活动
        emit RatingSubmitted(eventId, msg.sender, target, score);
    }

    function batchSubmitRatings(uint256 eventId, address[] calldata targets, uint8[] calldata scores) external override {
        require(targets.length == scores.length, "Length mismatch");
        for (uint256 i = 0; i < targets.length; i++) {
            // check validation if needed
            emit RatingSubmitted(eventId, msg.sender, targets[i], scores[i]);
        }
    }

    function getEventPlayers(uint256 eventId) external view override returns (address[] memory) {
        return eventPlayers[eventId];
    }

    // --- Internal Helpers ---

    function _removePlayer(uint256 eventId, address player) internal {
        address[] storage list = eventPlayers[eventId];
        for (uint256 i = 0; i < list.length; i++) {
            if (list[i] == player) {
                list[i] = list[list.length - 1];
                list.pop();
                break;
            }
        }
    }

    /**
     * @dev 核心计算逻辑提取：根据总支出计算退款详情
     * @return confirmedCount 确认人数
     * @return refundPerPlayer 人均退款额
     * @return surplus 总剩余资金
     */
    function _calculateRefundValues(uint256 eventId, uint256 totalExpense) internal view 
        returns (uint256 confirmedCount, uint256 refundPerPlayer, uint256 surplus) {
        address[] memory _players = eventPlayers[eventId];
        confirmedCount = 0;
        
        // 1. 统计确认人数
        for (uint256 i = 0; i < _players.length; i++) {
            if (players[eventId][_players[i]].isApproved) {
                confirmedCount++;
            }
        }

        // 2. 计算金额
        surplus = 0;
        refundPerPlayer = 0;
        
        ActivityConfig storage evt = events[eventId];
        
        if (confirmedCount > 0) {
            uint256 totalIncome = confirmedCount * evt.feePerPerson;
            if (totalIncome > totalExpense) {
                surplus = totalIncome - totalExpense;
                refundPerPlayer = surplus / confirmedCount;
            }
        }
    }
}

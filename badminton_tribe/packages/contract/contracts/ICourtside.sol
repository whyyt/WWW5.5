// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

/**
 * @title ICourtside
 * @dev Interface for the Badminton Event Management Contract (MVP)
 */
interface ICourtside {
    
    // --- Enums & Structs ---

    enum EventStatus {
        Draft,      // Created but not yet open for joining
        Open,       // Accepting players
        Full,       // Reached max participants
        Active,     // Event started/ongoing
        Settling,   // Event ended, Host initiated settlement (Challenge Period)
        Completed,  // Funds distributed
        Cancelled   // Event cancelled, funds refunded
    }

    struct ActivityConfig {
        string name;
        string description;
        string location;        // Venue location
        uint256 startTime;
        uint256 duration;       // in seconds
        address host;
        address tokenAddress;   // Supported Stablecoin (USDT/USDC)
        uint8 tokenDecimals;    // Token decimals
        uint256 feePerPerson;   // Estimated fee collected upfront
        uint256 maxPlayers;
        uint256 minPlayers;
        uint8 minLevelMale;     // Skill level 10-100
        uint8 minLevelFemale;   // Skill level 10-100
    }

    struct CreateEventInput {
        string name;
        string description;
        string location;
        uint256 startTime;
        uint256 duration;
        address tokenAddress;
        uint256 feePerPerson; 
        uint256 maxPlayers;
        uint256 minPlayers;
        uint8 minLevelMale;
        uint8 minLevelFemale;
    }

    struct PlayerInfo {
        address wallet;
        bool hasPaid;
        bool isApproved;    // Host approval status
        bool isCheckedIn;   // Optional for MVP
        uint256 refundAmount;
    }

    // --- Events ---

    event EventCreated(uint256 indexed eventId, address indexed host, string name, uint256 timestamp);
    event PlayerJoined(uint256 indexed eventId, address indexed player, uint256 timestamp);
    event ApplicationWithdrawn(uint256 indexed eventId, address indexed player, uint256 timestamp);
    event PlayerApproved(uint256 indexed eventId, address indexed player, uint256 timestamp);
    event PlayerRejected(uint256 indexed eventId, address indexed player, uint256 timestamp);
    event EventCancelled(uint256 indexed eventId, string reason, uint256 timestamp);
    event SettlementInitiated(uint256 indexed eventId, uint256 totalExpense, uint256 refundPerPlayer, uint256 timestamp, uint256 challengeEndTime);
    event SettlementChallenge(uint256 indexed eventId, address indexed challenger, uint256 timestamp);
    event DisputeResolved(uint256 indexed eventId, uint256 finalExpense, bool challengerWin);
    event FundsDistributed(uint256 indexed eventId, uint256 hostPayout, uint256 totalRefunds);
    
    // Gas Optimization: Store ratings as event logs only
    event RatingSubmitted(uint256 indexed eventId, address indexed rater, address indexed target, uint8 score);

    // --- Core Functions ---

    /**
     * @notice Host creates a new badminton event
     * @param config The configuration struct for the event (without host and decimals)
     * @return eventId The unique ID of the new event
     */
    function createEvent(CreateEventInput calldata config) external returns (uint256 eventId);

    /**
     * @notice Player joins an event and pays the upfront fee
     * @dev Requires token approval
     * @param eventId The ID of the event to join
     */
    function joinEvent(uint256 eventId) external;

    /**
     * @notice Player withdraws their application before approval
     * @param eventId The ID of the event
     */
    function withdrawApplication(uint256 eventId) external;

    /**
     * @notice Host approves a player's participation
     * @param eventId The ID of the event
     * @param player The address of the player to approve
     */
    function approvePlayer(uint256 eventId, address player) external;

    /**
     * @notice Host approves players' participation in batch
     * @param eventId The ID of the event
     * @param playersToApprove The addresses of the players to approve
     */
    function batchApprovePlayers(uint256 eventId, address[] calldata playersToApprove) external;

    /**
     * @notice Host rejects a player's application
     * @dev Refunds are added to withdrawableFunds (Pull pattern) to prevent DoS
     * @param eventId The ID of the event
     * @param player The address of the player to reject
     */
    function rejectPlayer(uint256 eventId, address player) external;

    /**
     * @notice Cancels the event and triggers refunds.
     * @dev Can be called by Host (anytime before start) or anyone (if minPlayers not met by startTime)
     * @param eventId The ID of the event
     */
    function cancelEvent(uint256 eventId) external;

    /**
     * @notice Host submits actual expenses to initiate settlement
     * @dev Starts the Challenge Period (e.g., 24 hours)
     * @param eventId The ID of the event
     * @param totalExpense The actual cost incurred for the venue//* @param proofHash IPFS hash of the receipt/invoice image
     */
    function settlePayment(uint256 eventId, uint256 totalExpense/*, string calldata proofHash*/) external;

    /**
     * @notice Raise a dispute during the Challenge Period
     * @param eventId The ID of the event
     */
    function challengeSettlement(uint256 eventId) external payable;

    /**
     * @notice Resolve dispute
     * @param eventId The ID of the event
     * @param finalExpense Final expense after resolving the dispute
     * @param challengerWin Whether the challenger wins
     * @param challenger The address of the challenger
     */
    function resolveDispute(uint256 eventId, uint256 finalExpense, bool challengerWin, address payable challenger) external;

    /**
     * @notice Finalize the settlement after Challenge Period ends
     * @dev Distributes funds to Host and refunds to Players
     * @param eventId The ID of the event
     */
    function finalizeSettlement(uint256 eventId) external;

    /**
     * Claim the refund
     * @param eventId The ID of the event
     */
    function claimFunds(uint256 eventId) external;

    /**
     * @notice Submit a rating for a player or host
     * @dev Logic is off-chain; this is just for on-chain proof
     */
    function submitRating(uint256 eventId, address target, uint8 score) external;

    /**
     * @notice Batch submit ratings
     * @param eventId The ID of the event
     * @param targets Array of addresses to rate
     * @param scores Array of scores
     */
    function batchSubmitRatings(uint256 eventId, address[] calldata targets, uint8[] calldata scores) external;

    /**
     * @notice Get all players for an event
     * @param eventId The ID of the event
     * @return An array of player addresses
     */
    function getEventPlayers(uint256 eventId) external view returns (address[] memory);
}

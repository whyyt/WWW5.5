import { loadFixture } from "@nomicfoundation/hardhat-toolbox/network-helpers";
import { expect } from "chai";
import { ethers } from "hardhat";
import { Courtside, MockERC20 } from "../typechain-types";

describe("Courtside", function () {
  async function deployCourtsideFixture() {
    const [owner, host1, player1, player2, player3] = await ethers.getSigners();

    // Deploy Mock Token
    const MockERC20Factory = await ethers.getContractFactory("MockERC20");
    const token = (await MockERC20Factory.deploy("Test USDT", "USDT")) as unknown as MockERC20;
    await token.waitForDeployment();

    // Deploy Courtside
    const CourtsideFactory = await ethers.getContractFactory("Courtside");
    const courtside = (await CourtsideFactory.deploy()) as unknown as Courtside;
    await courtside.waitForDeployment();

    // Mint tokens to players
    await token.mint(player1.address, ethers.parseEther("1000"));
    await token.mint(player2.address, ethers.parseEther("1000"));
    await token.mint(player3.address, ethers.parseEther("1000"));

    // Approve contract
    await token.connect(player1).approve(await courtside.getAddress(), ethers.MaxUint256);
    await token.connect(player2).approve(await courtside.getAddress(), ethers.MaxUint256);
    await token.connect(player3).approve(await courtside.getAddress(), ethers.MaxUint256);

    return { courtside, token, owner, host1, player1, player2, player3 };
  }

  describe("Event Management", function () {
    it("Should create an event successfully", async function () {
      const { courtside, token, host1 } = await loadFixture(deployCourtsideFixture);
      
      const now = Math.floor(Date.now() / 1000);
      const startTime = now + 86400; // 1 day later

      const config = {
        name: "Badminton Match",
        description: "Friendly match",
        startTime: startTime,
        duration: 3600,
        host: host1.address, // This might be overridden by contract to msg.sender if called by host1
        tokenAddress: await token.getAddress(),
        feePerPerson: ethers.parseEther("10"),
        maxPlayers: 4,
        minPlayers: 2,
        minLevelMale: 1,
        minLevelFemale: 1
      };

      // Call as host1
      await expect(courtside.connect(host1).createEvent(config))
        .to.emit(courtside, "EventCreated")
        .withArgs(1, host1.address, "Badminton Match");
        
      const eventStatus = await courtside.eventStatus(1);
      expect(eventStatus).to.equal(1); // Open
    });

    it("Should allow players to join", async function () {
        const { courtside, token, host1, player1 } = await loadFixture(deployCourtsideFixture);
        
        const now = Math.floor(Date.now() / 1000);
        const config = {
          name: "Game 1",
          description: "",
          startTime: now + 86400,
          duration: 3600,
          host: host1.address,
          tokenAddress: await token.getAddress(),
          feePerPerson: ethers.parseEther("10"),
          maxPlayers: 4,
          minPlayers: 2,
          minLevelMale: 1,
          minLevelFemale: 1
        };
  
        await courtside.connect(host1).createEvent(config);
  
        await expect(courtside.connect(player1).joinEvent(1))
            .to.emit(courtside, "PlayerJoined")
            .withArgs(1, player1.address);
        
        // Check balance deduction
        expect(await token.balanceOf(player1.address)).to.equal(ethers.parseEther("990"));
    });
  });

  describe("Settlement", function () {
      it("Should settle and distribute refunds", async function () {
        const { courtside, token, host1, player1, player2, player3 } = await loadFixture(deployCourtsideFixture);
        const fee = ethers.parseEther("10");
        
        // Create Event
        const now = Math.floor(Date.now() / 1000);
        const config = {
            name: "Game Settle",
            description: "",
            startTime: now + 86400,
            duration: 3600,
            host: host1.address,
            tokenAddress: await token.getAddress(),
            feePerPerson: fee,
            maxPlayers: 4,
            minPlayers: 2,
            minLevelMale: 1,
            minLevelFemale: 1
        };
        await courtside.connect(host1).createEvent(config);

        // 3 players join
        await courtside.connect(player1).joinEvent(1);
        await courtside.connect(player2).joinEvent(1);
        await courtside.connect(player3).joinEvent(1);

        // Host approves all
        await courtside.connect(host1).approvePlayer(1, player1.address);
        await courtside.connect(host1).approvePlayer(1, player2.address);
        await courtside.connect(host1).approvePlayer(1, player3.address);

        // Expense is 20 tokens. Collected 30. Refund 10 (3.33 each).
        const totalExpense = ethers.parseEther("20");
        
        await expect(courtside.connect(host1).settlePayment(1, totalExpense, "QmHash"))
            .to.emit(courtside, "SettlementInitiated");

        // Fast forward challenge duration
        await ethers.provider.send("evm_increaseTime", [86400 + 1]);
        await ethers.provider.send("evm_mine", []);

        // Finalize
        await expect(courtside.finalizeSettlement(1))
            .to.emit(courtside, "FundsDistributed");

        // Check Host Balance (should receive expense)
        expect(await token.balanceOf(host1.address)).to.equal(totalExpense);
        
        // Check Player Refund
        // Total Surplus = 30 - 20 = 10.
        // Per Player = 10 / 3 = 3.3333...
        const expectedRefund = ethers.parseEther("10") / 3n;
        // Initial 1000 - paid 10 + refund 3.33
        const expectedBalance = ethers.parseEther("990") + expectedRefund;
        
        expect(await token.balanceOf(player1.address)).to.equal(expectedBalance);
      });
  });
});

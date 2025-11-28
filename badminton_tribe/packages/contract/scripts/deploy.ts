import { ethers } from "hardhat";

async function main() {
  const [deployer] = await ethers.getSigners();

  console.log("Deploying contracts with the account:", deployer.address);

  // 1. Deploy Mock Token
  const MockERC20 = await ethers.getContractFactory("MockERC20");
  const token = await MockERC20.deploy("Test USDT", "USDT");
  await token.waitForDeployment();
  const tokenAddress = await token.getAddress();
  console.log(`Mock USDT deployed to: ${tokenAddress}`);

  // 2. Deploy Courtside
  const Courtside = await ethers.getContractFactory("Courtside");
  const courtside = await Courtside.deploy();
  await courtside.waitForDeployment();
  const courtsideAddress = await courtside.getAddress();
  console.log(`Courtside deployed to: ${courtsideAddress}`);

  // 3. Register WhiteList
  console.log("Setting supported token...");
  await courtside.setSupportedToken(tokenAddress, true);
  console.log(`Token ${tokenAddress} is now supported.`);
  
  console.log("\n=== 请将以下地址更新到 packages/frontend/constants.ts ===");
  console.log(`export const MOCK_USDT_ADDRESS = "${tokenAddress}";`);
  console.log(`export const COURTSIDE_ADDRESS = "${courtsideAddress}";`);
  console.log("========================================================\n");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

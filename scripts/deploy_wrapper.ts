/**
 * Deploy AjunaWrapper system (ERC20 + Wrapper + grant MINTER_ROLE).
 *
 * This is a plain Hardhat script (no Ignition) so we can pass the
 * foreign asset address via environment variable — simpler for the E2E pipeline.
 *
 * Env vars:
 *   FOREIGN_ASSET  — Foreign asset address (required)
 *   DECIMALS       — Token decimals (default: 12)
 *
 * Usage:
 *   FOREIGN_ASSET=0x... npx hardhat run scripts/deploy_wrapper.ts --network local
 */

import { ethers } from "hardhat";

async function main() {
  const foreignAssetAddress = process.env.FOREIGN_ASSET;
  if (!foreignAssetAddress) {
    throw new Error("FOREIGN_ASSET env variable is required");
  }

  const decimals = parseInt(process.env.DECIMALS || "12", 10);
  const [deployer] = await ethers.getSigners();
  console.log("Deployer:", deployer.address);
  console.log("Foreign Asset:", foreignAssetAddress);
  console.log("Decimals:", decimals);

  // 1. Deploy AjunaERC20
  const TokenFactory = await ethers.getContractFactory("AjunaERC20");
  const token = await TokenFactory.deploy(
    "Wrapped Ajuna",
    "WAJUN",
    deployer.address,
    decimals
  );
  await token.waitForDeployment();
  const tokenAddr = await token.getAddress();
  console.log("AjunaERC20 deployed at:", tokenAddr);

  // 2. Deploy AjunaWrapper
  const WrapperFactory = await ethers.getContractFactory("AjunaWrapper");
  const wrapper = await WrapperFactory.deploy(tokenAddr, foreignAssetAddress);
  await wrapper.waitForDeployment();
  const wrapperAddr = await wrapper.getAddress();
  console.log("AjunaWrapper deployed at:", wrapperAddr);

  // 3. Grant MINTER_ROLE to Wrapper
  const MINTER_ROLE = ethers.keccak256(ethers.toUtf8Bytes("MINTER_ROLE"));
  const grantTx = await token.grantRole(MINTER_ROLE, wrapperAddr);
  await grantTx.wait();
  console.log("MINTER_ROLE granted to Wrapper");

  // Print summary for downstream scripts to parse
  console.log("\n═══ DEPLOYED ═══");
  console.log(`ERC20_ADDRESS=${tokenAddr}`);
  console.log(`WRAPPER_ADDRESS=${wrapperAddr}`);
  console.log(`FOREIGN_ASSET=${foreignAssetAddress}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

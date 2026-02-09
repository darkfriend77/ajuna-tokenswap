import { ethers } from "hardhat";

/**
 * Fund a target account from the pre-funded Alith dev account.
 *
 * On the revive-dev-node, Substrate (sr25519) accounts and Ethereum (secp256k1)
 * accounts live in different address spaces.  The dev-node genesis pre-funds
 * five well-known Ethereum accounts (Alith, Baltathar, Charleth, Dorothy, Ethan)
 * whose AccountId32 = H160 ++ 0xEE×12.
 *
 * The hardhat `local` network is configured with Alith's key, so ethers.getSigners()[0]
 * is Alith.
 *
 * Usage:
 *   npx hardhat run scripts/fund_account.ts --network local
 *   TARGET=0x... npx hardhat run scripts/fund_account.ts --network local
 */
async function main() {
    const [alith] = await ethers.getSigners();
    console.log("Alith (sender):", alith.address);

    // Determine target — env var or Baltathar (2nd dev account)
    const baltatharKey = "0x8075991ce870b93a8870eca0c0f91913d12f47948ca0fd25b49c6fa7cdbeee8b";
    const target = process.env.TARGET
        ? process.env.TARGET
        : new ethers.Wallet(baltatharKey).address;

    // Check balances
    const alithBalance = await ethers.provider.getBalance(alith.address);
    const targetBalance = await ethers.provider.getBalance(target);

    console.log(`Alith balance:  ${ethers.formatEther(alithBalance)} DEV`);
    console.log(`Target (${target}): ${ethers.formatEther(targetBalance)} DEV`);

    // Send 1000 DEV
    const amount = ethers.parseEther("1000");
    console.log(`\nSending ${ethers.formatEther(amount)} DEV to ${target}...`);

    const tx = await alith.sendTransaction({
        to: target,
        value: amount,
    });

    console.log("Transaction hash:", tx.hash);
    await tx.wait();
    console.log("Transaction confirmed!");

    const newBalance = await ethers.provider.getBalance(target);
    console.log(`New target balance: ${ethers.formatEther(newBalance)} DEV`);
}

main().catch(console.error);

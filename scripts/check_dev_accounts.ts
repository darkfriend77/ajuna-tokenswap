import { ethers } from "hardhat";

async function main() {
    // Well-known Ethereum dev accounts pre-funded on the revive-dev-node.
    // These are secp256k1 keys from subxt_signer::eth::dev::*.
    // Their Substrate AccountId32 = H160 ++ 0xEE×12 (eth-derived convention).
    const devAccounts = {
        "Alith":     "0x5fb92d6e98884f76de468fa3f6278f8807c48bebc13595d45af5bdc4da702133",
        "Baltathar": "0x8075991ce870b93a8870eca0c0f91913d12f47948ca0fd25b49c6fa7cdbeee8b",
        "Dorothy":   "0x39539ab1876910bbf3a223d84a29e28f1cb4e2e456503e7e91ed39b2e7223d68",
        "Ethan":     "0x7dce9bc8babb68fec1409be38c8e1a52650206a7ed90ff956ae8a6d15eeaaef4",
    };

    console.log("Checking balances of dev accounts:\n");

    for (const [name, privateKey] of Object.entries(devAccounts)) {
        try {
            const wallet = new ethers.Wallet(privateKey, ethers.provider);
            const balance = await ethers.provider.getBalance(wallet.address);
            console.log(`${name.padEnd(10)} ${wallet.address}  ${ethers.formatEther(balance)} DEV`);
        } catch (error) {
            console.log(`${name.padEnd(10)} Error: ${error.message}`);
        }
    }
}

main().catch(console.error);

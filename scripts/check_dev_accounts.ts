import { ethers } from "hardhat";

async function main() {
    // Well-known Substrate dev account private keys
    const devAccounts = {
        "Alice": "0xe5be9a5092b81bca64be81d212e7f2f9eba183bb7a90954f7b76361f6edb5c0a",
        "Bob": "0x398f0c28f98885e046333d4a41c19cee4c37368a9832c6502f6cfd182e2aef89",
        "Charlie": "0xbc1ede780f784aa49da4f0683f8c3e2a7f5a1b0f1b8e5c3d2a1f0e9d8c7b6a59",
        "Dave": "0x868020ae0687dda7d57565093a69090211449845a7e11453612800b663307246",
        "Eve": "0x786ad0e2df456fe43dd1f91ebca22e235bc162e0bb8d53c633e8c85b2af68b7a",
        "Ferdie": "0x42438b7883391c05512a938e36c2df0131e088b3756d6aa7a755fbff19d2f842"
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

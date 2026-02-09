import { ethers } from "hardhat";

async function main() {
    // Alice's account (pre-funded in dev mode)
    const alicePrivateKey = "0xe5be9a5092b81bca64be81d212e7f2f9eba183bb7a90954f7b76361f6edb5c0a";
    const alice = new ethers.Wallet(alicePrivateKey, ethers.provider);
    
    // Test account (from hardhat config)
    const testAccountPrivateKey = "0x99b3c12287537e38c90a9219d4cb074a89a16e9cdb20bf85728ebd97c343e342";
    const testAccount = new ethers.Wallet(testAccountPrivateKey, ethers.provider);
    
    console.log("Alice address:", alice.address);
    console.log("Test account address:", testAccount.address);
    
    // Check balances
    const aliceBalance = await ethers.provider.getBalance(alice.address);
    const testBalance = await ethers.provider.getBalance(testAccount.address);
    
    console.log(`Alice balance: ${ethers.formatEther(aliceBalance)} DEV`);
    console.log(`Test account balance: ${ethers.formatEther(testBalance)} DEV`);
    
    // Send 100 DEV to test account
    const amount = ethers.parseEther("100");
    console.log(`\nSending ${ethers.formatEther(amount)} DEV to test account...`);
    
    const tx = await alice.sendTransaction({
        to: testAccount.address,
        value: amount,
        gasPrice: 20000000000,
        gasLimit: 21000
    });
    
    console.log("Transaction hash:", tx.hash);
    await tx.wait();
    console.log("Transaction confirmed!");
    
    // Check new balance
    const newBalance = await ethers.provider.getBalance(testAccount.address);
    console.log(`New test account balance: ${ethers.formatEther(newBalance)} DEV`);
}

main().catch(console.error);

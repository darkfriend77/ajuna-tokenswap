import { ethers } from "ethers";

async function main() {
    const provider = new ethers.JsonRpcProvider("http://127.0.0.1:8545");
    const network = await provider.getNetwork();
    console.log(`Chain ID: ${network.chainId}`);
}

main().catch(console.error);

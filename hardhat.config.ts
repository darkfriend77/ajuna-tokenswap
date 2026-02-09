import { HardhatUserConfig, vars } from "hardhat/config";
import "@parity/hardhat-polkadot";
// import "@nomicfoundation/hardhat-ignition-ethers";
import "@nomicfoundation/hardhat-ethers";
import "@nomicfoundation/hardhat-chai-matchers";
import "@typechain/hardhat";
// import "@nomicfoundation/hardhat-toolbox"; // avoiding for now due to compatibility warning

// Retrieve the private key from Hardhat configuration variables
// Run 'npx hardhat vars set PRIVATE_KEY' to set it.
// Default fallback for CI/Local prevents crash if not set, but won't work for real deploy.
const PRIVATE_KEY = vars.has("PRIVATE_KEY") ? vars.get("PRIVATE_KEY") : "0x0000000000000000000000000000000000000000000000000000000000000000";

const config: HardhatUserConfig = {
  solidity: {
    version: "0.8.20",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
    },
  },
  networks: {
    hasura: {
      url: "http://127.0.0.1:8545",
      accounts: ["0x99b3c12287537e38c90a9219d4cb074a89a16e9cdb20bf85728ebd97c343e342"], // Alice private key default in substrate dev
      timeout: 60000,
    },
    local: { 
        url: "http://127.0.0.1:8545",
        chainId: 420420420,
        accounts: ["0x99b3c12287537e38c90a9219d4cb074a89a16e9cdb20bf85728ebd97c343e342"],
        gasPrice: 50000000000, // 50 gwei (matches base fee)
        gas: 6000000,
    },
    polkadotTestnet: {
        url: 'https://westend-asset-hub-eth-rpc.polkadot.io', // Using Westend Asset Hub ETH RPC
        chainId: 420420421, // Westend Asset Hub Chain ID (Check docs if 420420417 is correct for generic "testnet" or specific one)
        // HardHatEVM.md suggested 420420417 and https://services.polkadothub-rpc.com/testnet
        // We will stick to the one from the doc user provided 'HardHatEVM.md' to be safe:
        // url: 'https://services.polkadothub-rpc.com/testnet',
        // chainId: 420420417,
        accounts: [PRIVATE_KEY],
    }
  },
  // polkadot: {
  //   compiler: "@parity/resolc", // if needed to specific
  // }
};

export default config;

#!/bin/bash
set -e

echo "=== Deploying to Polkadot AssetHub Testnet ==="

# Check if PRIVATE_KEY variable is set in Hardhat
if ! npx hardhat vars get PRIVATE_KEY &> /dev/null; then
    echo "Error: PRIVATE_KEY is not set in Hardhat variables."
    echo "Please set your private key by running:"
    echo "  npx hardhat vars set PRIVATE_KEY"
    echo ""
    echo "WARNING: Ensure this account has testnet funds (PAS)."
    exit 1
fi

echo "Deploying contracts using Ignition..."
npx hardhat ignition deploy ./ignition/modules/AjunaWrapper.ts --network polkadotTestnet

echo "=== Deployment Complete ==="

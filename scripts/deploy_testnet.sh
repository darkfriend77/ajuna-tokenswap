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

echo ""
echo "=== Deployment Complete ==="
echo ""
echo "⚠️  POST-DEPLOYMENT CHECKLIST:"
echo "  1. Send 1–2 DOT to the AjunaWrapper address as Existential Deposit"
echo "     to prevent the account from being reaped by the Polkadot runtime."
echo "  2. Transfer DEFAULT_ADMIN_ROLE on AjunaERC20 to a multisig/governance address."
echo "  3. Renounce DEFAULT_ADMIN_ROLE from the deployer account."
echo "  4. Verify contract addresses and test a small wrap/unwrap cycle."

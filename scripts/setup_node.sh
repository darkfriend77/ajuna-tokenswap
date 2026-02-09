#!/bin/bash
set -e

echo "Starting setup for Polkadot SDK (Revive Node)..."

# Check for Rust
if ! command -v cargo &> /dev/null
then
    echo "Rust/Cargo is not installed. Please install it first:"
    echo "curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh"
    exit 1
fi

echo "Updating Rust to latest stable..."
rustup update stable

# Clone Repo if not exists
if [ ! -d "polkadot-sdk" ]; then
    echo "Cloning polkadot-sdk..."
    git clone https://github.com/paritytech/polkadot-sdk.git
else
    echo "polkadot-sdk directory already exists. Skipping clone."
fi

cd polkadot-sdk

echo "Building revive-dev-node (Release mode)..."
echo "WARNING: This may take 15-30 minutes."
cargo build -p revive-dev-node --bin revive-dev-node --release

echo "Building eth-rpc (Release mode)..."
cargo build -p pallet-revive-eth-rpc --bin eth-rpc --release

echo "Build complete!"
echo ""
echo "To run the node:"
echo "  ./polkadot-sdk/target/release/revive-dev-node --dev"
echo ""
echo "To run the RPC adapter (in a separate terminal):"
echo "  ./polkadot-sdk/target/release/eth-rpc --dev"

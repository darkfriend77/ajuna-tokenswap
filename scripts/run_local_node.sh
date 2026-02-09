#!/bin/bash
set -e

# Path to binaries (assuming setup_node.sh was run)
NODE_BIN="./polkadot-sdk/target/release/revive-dev-node"
RPC_BIN="./polkadot-sdk/target/release/eth-rpc"

if [ ! -f "$NODE_BIN" ] || [ ! -f "$RPC_BIN" ]; then
    echo "Error: Binaries not found."
    echo "Please run './scripts/setup_node.sh' first to build the node."
    exit 1
fi

echo "Starting Local Polkadot Revive Node..."

# Function to kill background processes on exit
cleanup() {
    echo "Shutting down..."
    kill $(jobs -p) 2>/dev/null
}
trap cleanup EXIT

# Start Node with Alice account pre-funded
$NODE_BIN --dev --alice &
NODE_PID=$!
echo "Node started (PID: $NODE_PID)"

# Wait for node to be ready (naive sleep, better to check port)
sleep 5

# Start RPC Adapter
echo "Starting ETH-RPC Adapter..."
$RPC_BIN --dev &
RPC_PID=$!
echo "RPC Adapter started (PID: $RPC_PID)"

echo ""
echo "Local Environment Running!"
echo "RPC URL: http://127.0.0.1:8545"
echo "Press Ctrl+C to stop."

# Wait for both processes
wait

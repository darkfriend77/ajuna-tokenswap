#!/bin/bash
set -e

NODE_BIN="./polkadot-sdk/target/release/revive-dev-node"
CHAIN_SPEC_DIR="./chain-specs"

if [ ! -f "$NODE_BIN" ]; then
    echo "Error: Node binary not found. Please run ./scripts/setup_node.sh first."
    exit 1
fi

echo "Creating chain spec directory..."
mkdir -p "$CHAIN_SPEC_DIR"

echo "Generating default chain spec..."
$NODE_BIN build-spec --dev > "$CHAIN_SPEC_DIR/dev-spec.json"

echo "Converting to raw chain spec..."
$NODE_BIN build-spec --chain="$CHAIN_SPEC_DIR/dev-spec.json" --raw > "$CHAIN_SPEC_DIR/dev-spec-raw.json"

echo ""
echo "Chain spec generated at: $CHAIN_SPEC_DIR/dev-spec-raw.json"
echo ""
echo "To use this chain spec, update run_local_node.sh to use:"
echo "  \$NODE_BIN --chain=\"$CHAIN_SPEC_DIR/dev-spec-raw.json\" &"

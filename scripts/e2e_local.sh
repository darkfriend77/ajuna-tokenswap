#!/bin/bash
set -e

# ╔══════════════════════════════════════════════════════════════════╗
# ║  Full E2E Test Flow — Local Dev Node                           ║
# ║                                                                ║
# ║  This script orchestrates the complete testing pipeline:       ║
# ║    1. Deploy a mock Foreign Asset (since devnode has no         ║
# ║       pallet-assets / precompile)                              ║
# ║    2. Deploy AjunaWrapper + AjunaERC20 via deploy_wrapper.ts   ║
# ║    3. Run the E2E integration test script                      ║
# ║                                                                ║
# ║  Prerequisites:                                                ║
# ║    - Local node running:  ./scripts/run_local_node.sh          ║
# ║    - npm install done                                          ║
# ║    - Contracts compiled:  npx hardhat compile                  ║
# ╚══════════════════════════════════════════════════════════════════╝

NETWORK="${1:-local}"
echo ""
echo "═══════════════════════════════════════════════════"
echo "  Ajuna Token Swap — E2E Test Pipeline"
echo "  Network: $NETWORK"
echo "═══════════════════════════════════════════════════"
echo ""

# ── Step 0: Verify the node is reachable ─────────────────────────
echo "Step 0: Checking node connectivity..."
if ! curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:8545 | grep -q "200\|405\|415"; then
    echo "  ❌ Cannot reach http://127.0.0.1:8545"
    echo "  Start the local node first: ./scripts/run_local_node.sh"
    exit 1
fi
echo "  ✅ Node is reachable"
echo ""

# ── Step 1: Verify deployer has balance ──────────────────────────
echo "Step 1: Checking Alith (deployer) balance..."
BALANCE=$(curl -s -X POST http://127.0.0.1:8545 \
    -H "Content-Type: application/json" \
    -d '{"jsonrpc":"2.0","method":"eth_getBalance","params":["0xf24FF3a9CF04c71Dbc94D0b566f7A27B94566cac","latest"],"id":1}' \
    | grep -oP '"result":"0x\K[^"]+')
if [ -z "$BALANCE" ] || [ "$BALANCE" = "0" ]; then
    echo "  ❌ Alith has no balance. Node may not have started correctly."
    exit 1
fi
echo "  ✅ Alith is funded (pre-funded in genesis)"
echo ""

# ── Step 2: Deploy mock Foreign Asset ────────────────────────────
echo "Step 2: Deploying mock Foreign Asset..."
DEPLOY_OUTPUT=$(npx hardhat run scripts/deploy_mock_foreign_asset.ts --network "$NETWORK" 2>&1)
echo "$DEPLOY_OUTPUT"

# Extract the mock FA address from output
FOREIGN_ASSET=$(echo "$DEPLOY_OUTPUT" | grep "Mock Foreign Asset deployed at:" | awk '{print $NF}')
if [ -z "$FOREIGN_ASSET" ]; then
    echo "  ❌ Could not extract mock foreign asset address from deploy output"
    exit 1
fi
echo "  → Foreign Asset: $FOREIGN_ASSET"
echo ""

# ── Step 3: Deploy AjunaWrapper + AjunaERC20 ────────────────────
echo "Step 3: Deploying AjunaWrapper system..."

WRAPPER_DEPLOY_OUTPUT=$(FOREIGN_ASSET="$FOREIGN_ASSET" npx hardhat run scripts/deploy_wrapper.ts --network "$NETWORK" 2>&1)
echo "$WRAPPER_DEPLOY_OUTPUT"

# Extract deployed addresses from output
ERC20_ADDRESS=$(echo "$WRAPPER_DEPLOY_OUTPUT" | grep "^ERC20_ADDRESS=" | cut -d= -f2)
WRAPPER_ADDRESS=$(echo "$WRAPPER_DEPLOY_OUTPUT" | grep "^WRAPPER_ADDRESS=" | cut -d= -f2)

if [ -z "$WRAPPER_ADDRESS" ] || [ -z "$ERC20_ADDRESS" ]; then
    echo "  ❌ Could not determine deployed contract addresses."
    echo "  Please run the E2E test manually:"
    echo "    WRAPPER_ADDRESS=<addr> ERC20_ADDRESS=<addr> FOREIGN_ASSET=$FOREIGN_ASSET npx hardhat run scripts/e2e_test.ts --network $NETWORK"
    exit 1
fi

echo ""
echo "  → Wrapper: $WRAPPER_ADDRESS"
echo "  → ERC20:   $ERC20_ADDRESS"
echo "  → Foreign: $FOREIGN_ASSET"
echo ""

# ── Step 4: Run E2E test ─────────────────────────────────────────
echo "Step 4: Running E2E integration test..."
echo ""
WRAPPER_ADDRESS="$WRAPPER_ADDRESS" \
ERC20_ADDRESS="$ERC20_ADDRESS" \
FOREIGN_ASSET="$FOREIGN_ASSET" \
npx hardhat run scripts/e2e_test.ts --network "$NETWORK"

echo ""
echo "═══════════════════════════════════════════════════"
echo "  E2E Pipeline Complete"
echo ""
echo "  To test with the dApp UI:"
echo "  ./scripts/serve_ui.sh"
echo "  http://localhost:8000/app.html?wrapper=$WRAPPER_ADDRESS&erc20=$ERC20_ADDRESS&foreign=$FOREIGN_ASSET"
echo "═══════════════════════════════════════════════════"
echo ""

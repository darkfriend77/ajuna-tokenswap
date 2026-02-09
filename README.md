# Ajuna Tokenswap

A smart contract system to transform AJUN Foreign Assets into ERC20 tokens (wAJUN) on Polkadot AssetHub using `pallet-revive`.

## Overview

This project implements a treasury-based token wrapper that:
- Locks AJUN Foreign Assets in a treasury contract (`AjunaWrapper`)
- Mints equivalent ERC20 tokens (`AjunaERC20` / wAJUN) to users
- Allows users to burn wAJUN (via standard ERC20 approval) to withdraw their locked Foreign Assets
- Uses role-based access control (`MINTER_ROLE`) for secure mint/burn operations
- Includes a pausable circuit breaker, token rescue, and upgradeable foreign asset address

## Architecture

```
┌─────────────────┐
│ IERC20Precompile│ ← Interface to Foreign Asset precompile
└─────────────────┘
         ↑
         │ transferFrom / transfer
┌─────────────────┐      mint / burnFrom     ┌──────────────┐
│  AjunaWrapper   │────────────────────────→  │  AjunaERC20  │
│   (Treasury)    │                           │   (wAJUN)    │
│   Ownable       │                           │ AccessControl│
│   Pausable      │                           └──────────────┘
│   ReentrancyGuard│
└─────────────────┘
```

### Contracts

- **`IERC20Precompile.sol`**: Interface for the Foreign Asset precompile (ERC20-compatible)
- **`AjunaERC20.sol`**: Wrapped AJUN ERC20 token with configurable decimals and role-gated `mint()` / `burnFrom()`
- **`AjunaWrapper.sol`**: Treasury contract — Pausable, with rescue, foreign asset address update, and reentrancy guard

## Prerequisites

- Node.js v22+ and npm
- Git

## Installation

```bash
git clone <repository-url>
cd ajuna-tokenswap
npm install --legacy-peer-deps
```

## Project Structure

```
ajuna-tokenswap/
├── contracts/
│   ├── AjunaERC20.sol           # ERC20 wrapper token (wAJUN)
│   ├── AjunaWrapper.sol         # Treasury contract
│   └── interfaces/
│       └── IERC20Precompile.sol # Foreign Asset interface
├── test/
│   └── wrapper.test.ts          # Comprehensive test suite (29 tests)
├── ignition/
│   └── modules/
│       └── AjunaWrapper.ts      # Deployment module
├── scripts/
│   ├── setup_node.sh            # Build revive-dev-node
│   ├── run_local_node.sh        # Run local PVM node
│   ├── deploy_testnet.sh        # Deploy to testnet
│   └── serve_ui.sh              # Serve the UIs
├── app.html                     # User-facing swap dApp (MetaMask)
├── test-ui.html                 # Developer testing interface
├── hardhat.config.ts            # Hardhat configuration
└── README.md
```

## Configuration

The project is configured in `hardhat.config.ts` with two networks plus the default in-memory network:

| Network | Chain ID | Purpose |
|---------|----------|---------|
| `hardhat` (default) | — | In-memory testing |
| `local` | 420420420 | Local `revive-dev-node` |
| `polkadotTestnet` | 420420417 | Polkadot Hub TestNet |

## Testing

### Run Tests

```bash
npm test
# or
npx hardhat test
```

Expected output:
```
  AjunaWrapper System
    Deployment
      ✔ should set correct token and foreignAsset addresses
      ✔ should set correct decimals
      ✔ should revert AjunaERC20 deployment with zero admin
      ✔ should revert AjunaWrapper deployment with zero token address
      ✔ should revert AjunaWrapper deployment with zero precompile address
    Deposit (Wrap)
      ✔ should wrap Foreign Assets and emit Deposited event
      ✔ should revert on zero amount
      ✔ should revert without prior approval
      ✔ should maintain invariant after multiple deposits
    Withdraw (Unwrap)
      ✔ should unwrap ERC20 tokens and emit Withdrawn event
      ✔ should revert on zero amount
      ✔ should revert with insufficient ERC20 balance
      ✔ should revert without ERC20 approval (burnFrom requires allowance)
      ✔ should maintain invariant after full unwrap
    Access Control
      ✔ should prevent non-MINTER from calling mint
      ✔ should prevent non-MINTER from calling burnFrom
      ✔ deployer should NOT have MINTER_ROLE by default
      ✔ wrapper should have MINTER_ROLE
    Pausable
      ✔ should reject deposit when paused
      ✔ should reject withdraw when paused
      ✔ should resume after unpause
      ✔ should only allow owner to pause/unpause
    Rescue
      ✔ should rescue accidentally sent tokens
      ✔ should NOT allow rescuing the locked foreign asset
      ✔ should only allow owner to rescue
    Foreign Asset Update
      ✔ should allow owner to update foreign asset address
      ✔ should reject zero address
      ✔ should reject non-owner
    Multi-User
      ✔ should handle interleaved wrap/unwrap from two users

  29 passing
```

### Test Coverage

The suite covers:
- **Deployment**: Constructor validation, address(0) rejection, decimals
- **Deposit (Wrap)**: Happy path, zero amount, missing approval, backing invariant
- **Withdraw (Unwrap)**: Happy path (with ERC20 approval), zero amount, insufficient balance, missing approval, backing invariant
- **Access Control**: MINTER_ROLE enforcement, deployer has no mint rights
- **Pausable**: Circuit breaker on/off for both deposit and withdraw
- **Rescue**: Token rescue works; locked foreign asset cannot be rescued; owner-only
- **Foreign Asset Update**: Mutable address with owner-only guard
- **Multi-User**: Interleaved operations maintain 1:1 backing invariant

### User-Facing Swap dApp (`app.html`)

A guided, wallet-connected dApp for end users to wrap and unwrap AJUN tokens.

#### Prerequisites

- A browser wallet: [MetaMask](https://metamask.io), [SubWallet](https://www.subwallet.app), or [Talisman](https://www.talisman.xyz) (EVM mode)
- Your wallet must be connected to the correct AssetHub network (local or testnet)
- You must have AJUN Foreign Assets on AssetHub (transferred via XCM from Ajuna Network)

#### Quick Start

1. **Deploy the contracts** (if not already deployed):
   ```bash
   npx hardhat ignition deploy ./ignition/modules/AjunaWrapper.ts --network local
   ```
2. **Start the UI server**:
   ```bash
   ./scripts/serve_ui.sh
   ```
3. **Open in browser** with contract addresses as URL parameters:
   ```
   http://localhost:8000/app.html?wrapper=0x...&erc20=0x...&foreign=0x...
   ```
   Or edit the `CONFIG` object at the top of the `<script>` section in `app.html`.

4. **Connect your wallet** — click "Connect Wallet" and approve in MetaMask

#### Swap Workflow

**Wrap (AJUN → wAJUN):**
1. Enter the amount of AJUN you want to wrap
2. Click **"Approve AJUN"** — this grants the Wrapper contract permission to pull your AJUN tokens
3. Confirm the approval transaction in your wallet
4. Click **"Wrap → Receive wAJUN"** — this locks your AJUN and mints wAJUN to your address
5. Confirm the wrap transaction in your wallet

**Unwrap (wAJUN → AJUN):**
1. Switch to the "Unwrap" tab
2. Enter the amount of wAJUN you want to unwrap
3. Click **"Approve wAJUN"** — this grants the Wrapper contract permission to burn your wAJUN
4. Confirm the approval transaction in your wallet
5. Click **"Unwrap → Receive AJUN"** — this burns your wAJUN and releases the locked AJUN back to you
6. Confirm the unwrap transaction in your wallet

#### Configuring the Network in MetaMask

To add the Polkadot AssetHub network to MetaMask:

| Field | Local Dev Node | Polkadot Hub TestNet |
|-------|---------------|---------------------|
| Network Name | AssetHub Local | AssetHub TestNet |
| RPC URL | `http://127.0.0.1:8545` | `https://services.polkadothub-rpc.com/testnet` |
| Chain ID | `420420420` | `420420417` |
| Currency Symbol | `DOT` | `DOT` |

### Developer Testing UI (`test-ui.html`)

For interactive developer testing on a local node (uses hardcoded test accounts):

1. **Start the local node**: `./scripts/run_local_node.sh`
2. **Deploy contracts**: `npx hardhat ignition deploy ./ignition/modules/AjunaWrapper.ts --network local`
3. **Start the test UI server**: `./scripts/serve_ui.sh`
4. **Open in browser**: http://localhost:8000/test-ui.html
5. Paste the wrapper, ERC20, and foreign asset addresses, then click "Load Contracts"

**Workflow**:
1. Click "Fund Test Account" to get 100 DEV from Alice
2. **Approve Foreign Asset** → **Deposit** (wrap)
3. **Approve ERC20 (wAJUN)** → **Withdraw** (unwrap)
4. Watch balances and treasury invariant update in real-time

## Usage Example

### Wrap Foreign Assets (Deposit)

```javascript
const wrapper = await ethers.getContractAt("AjunaWrapper", wrapperAddress);
const foreignAsset = new ethers.Contract(precompileAddress, IERC20_ABI, signer);
const amount = ethers.parseUnits("100", 12); // 12 decimals for AJUN

// 1. Approve wrapper to pull Foreign Assets
await foreignAsset.approve(wrapperAddress, amount);

// 2. Deposit (lock Foreign Assets, mint wAJUN)
await wrapper.deposit(amount);
```

### Unwrap ERC20 Tokens (Withdraw)

```javascript
const erc20 = await ethers.getContractAt("AjunaERC20", erc20Address);

// 1. Approve wrapper to burnFrom your wAJUN
await erc20.approve(wrapperAddress, amount);

// 2. Withdraw (burn wAJUN, release Foreign Assets)
await wrapper.withdraw(amount);
```

## Security Features

- **Role-based access control** (OpenZeppelin `AccessControl`) — only the Wrapper can mint/burn
- **burnFrom pattern** — the Wrapper cannot burn user tokens without their explicit ERC20 approval
- **Reentrancy protection** (`ReentrancyGuard`) on all state-changing user functions
- **Pausable** circuit breaker — owner can freeze all operations in an emergency
- **Token rescue** — owner can recover accidentally sent tokens (but not the locked foreign asset)
- **Mutable foreign asset address** — owner can update the precompile address if it changes with a runtime upgrade
- **Constructor validation** — rejects zero addresses

### Post-Deployment Checklist

After deploying to a live network:
1. Send 1–2 DOT to the Wrapper address as **Existential Deposit** to prevent account reaping
2. Transfer `DEFAULT_ADMIN_ROLE` on AjunaERC20 to a **multisig/governance** address
3. **Renounce** `DEFAULT_ADMIN_ROLE` from the deployer account
4. Verify a small wrap/unwrap cycle end-to-end

## Compilation

```bash
npx hardhat compile
```

Uses `@parity/resolc` to compile Solidity → RISC-V bytecode for `pallet-revive`.

## Deployment

### Testnet (Polkadot Hub TestNet)

1. Get test tokens from the [Polkadot Faucet](https://faucet.polkadot.io/)
2. `npx hardhat vars set PRIVATE_KEY`
3. `./scripts/deploy_testnet.sh`

### Manual

```bash
npx hardhat ignition deploy ./ignition/modules/AjunaWrapper.ts --network polkadotTestnet
```

## Troubleshooting

| Issue | Solution |
|-------|----------|
| Compilation errors | `npx hardhat clean && npm install --legacy-peer-deps && npx hardhat compile` |
| Local node not pre-funded | Use `npx hardhat test` (in-memory) or fund via `scripts/fund_account.ts` |
| Dependency conflicts | Use `npm install --legacy-peer-deps` |

## Resources

- [Polkadot Revive Documentation](https://github.com/paritytech/polkadot-sdk/tree/master/substrate/frame/revive)
- [Hardhat Polkadot Plugin](https://github.com/paritytech/hardhat-polkadot)
- [ERC20 Precompile Docs](https://docs.polkadot.com/smart-contracts/precompiles/erc20/)
- [OpenZeppelin Contracts](https://docs.openzeppelin.com/contracts)

## License

ISC

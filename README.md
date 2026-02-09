# Ajuna Tokenswap

A smart contract system to transform AJUN Foreign Assets into ERC20 tokens on Polkadot AssetHub using `pallet-revive`.

## Overview

This project implements a treasury-based token wrapper that:
- Locks AJUN Foreign Assets in a treasury contract (`AjunaWrapper`)
- Mints equivalent ERC20 tokens (`AjunaERC20`) to users
- Allows users to burn ERC20 tokens to withdraw their locked Foreign Assets
- Uses role-based access control for secure operations

## Architecture

```
┌─────────────────┐
│ IERC20Precompile│ ← Interface to Foreign Asset precompile (address 0x400)
└─────────────────┘
         ↑
         │
┌─────────────────┐      ┌──────────────┐
│  AjunaWrapper   │─────→│  AjunaERC20  │
│   (Treasury)    │      │   (Wrapped)  │
└─────────────────┘      └──────────────┘
```

### Contracts

- **`IERC20Precompile.sol`**: Interface for the Foreign Asset precompile at address `0x400`
- **`AjunaERC20.sol`**: Standard ERC20 token with mint/burn capabilities
- **`AjunaWrapper.sol`**: Treasury contract that manages the wrapping/unwrapping logic

## Prerequisites

- Node.js v18+ and npm
- Git

## Installation

```bash
# Clone the repository
git clone <repository-url>
cd ajuna-tokenswap

# Install dependencies
npm install --legacy-peer-deps
```

## Project Structure

```
ajuna-tokenswap/
├── contracts/
│   ├── AjunaERC20.sol           # ERC20 wrapper token
│   ├── AjunaWrapper.sol         # Treasury contract
│   └── interfaces/
│       └── IERC20Precompile.sol # Foreign Asset interface
├── test/
│   └── wrapper.test.ts          # Unit tests
├── ignition/
│   └── modules/
│       └── AjunaWrapper.ts      # Deployment module
├── scripts/
│   ├── setup_node.sh            # Build revive-dev-node
│   ├── run_local_node.sh        # Run local PVM node
│   └── deploy_testnet.sh        # Deploy to testnet
├── hardhat.config.ts            # Hardhat configuration
└── README.md
```

## Configuration

The project is configured in `hardhat.config.ts` with three networks:

1. **`hardhat`** (default): In-memory network for testing
2. **`local`**: Local `revive-dev-node` (Chain ID: 420420420)
3. **`polkadotTestnet`**: Westend Asset Hub testnet

## Testing

### Run Tests (Recommended)

Tests run on Hardhat's built-in network with automatic account funding:

```bash
npx hardhat test
```

Expected output:
```
  AjunaWrapper System
    ✔ Should wrap (deposit) Foreign Assets
    ✔ Should unwrap (withdraw) ERC20 tokens

  2 passing (337ms)
```

### Test Coverage

The test suite verifies:
- ✅ Wrapping: Locking Foreign Assets and minting ERC20 tokens
- ✅ Unwrapping: Burning ERC20 tokens and withdrawing Foreign Assets
- ✅ Role-based access control (MINTER_ROLE)
- ✅ Event emissions

### Visual Testing with Web UI

For interactive visual testing on the local node:

1. **Start the local node**:
   ```bash
   ./scripts/run_local_node.sh
   ```

2. **Start the test UI server**:
   ```bash
   ./scripts/serve_ui.sh
   ```

3. **Open in browser**: http://localhost:8000/test-ui.html

The Web UI provides:
- 💰 **Account Funding**: One-click funding from Alice's pre-funded account
- 📊 **Live Balances**: Real-time display of native, Foreign Asset, and ERC20 balances
- 📥 **Wrap Operations**: Visual interface for approving and wrapping tokens
- 📤 **Unwrap Operations**: Visual interface for approving and unwrapping tokens
- 📝 **Activity Log**: Real-time transaction status and event logging
- 🎨 **Beautiful UI**: Modern, responsive design with smooth animations

**Workflow**:
1. Click "Fund Test Account" to get 100 DEV tokens
2. Deploy contracts using Hardhat (or paste existing addresses)
3. Use the Wrap/Unwrap sections to test token operations
4. Watch balances update in real-time

## Compilation

Compile contracts to PVM bytecode:

```bash
npx hardhat compile
```

This uses `@parity/resolc` to compile Solidity to RISC-V bytecode for `pallet-revive`.

## Local Development Node

### Setup (One-time)

Build the `revive-dev-node`:

```bash
./scripts/setup_node.sh
```

This clones and builds the Polkadot SDK with `pallet-revive` support (~30-60 minutes).

### Run Local Node

```bash
./scripts/run_local_node.sh
```

The node will:
- Start on `ws://127.0.0.1:9944` (Substrate RPC)
- Start ETH-RPC adapter on `http://127.0.0.1:8545`
- Use Chain ID: `420420420`

**Note**: The local node doesn't pre-fund accounts automatically. For local testing, use the Hardhat network instead (`npx hardhat test`).

## Deployment

### Testnet Deployment (Westend Asset Hub)

1. **Get Testnet Tokens**
   - Visit [Westend Faucet](https://faucet.polkadot.io/)
   - Request WND tokens for your account

2. **Set Private Key**
   ```bash
   npx hardhat vars set PRIVATE_KEY
   # Enter your private key when prompted
   ```

3. **Deploy**
   ```bash
   ./scripts/deploy_testnet.sh
   ```

The deployment script will:
- Deploy `AjunaERC20` contract
- Deploy `AjunaWrapper` contract
- Grant `MINTER_ROLE` to the wrapper
- Save deployment addresses to `deployments/testnet.json`

### Manual Deployment

```bash
npx hardhat ignition deploy ./ignition/modules/AjunaWrapper.ts --network polkadotTestnet
```

## Contract Addresses

After deployment, addresses are saved in:
- `deployments/testnet.json` (Westend Asset Hub)
- `deployments/local.json` (Local node)

## Usage Example

### Wrap Foreign Assets

```javascript
const wrapper = await ethers.getContractAt("AjunaWrapper", wrapperAddress);
const amount = ethers.parseUnits("100", 18);

// Approve wrapper to spend Foreign Assets
await foreignAsset.approve(wrapperAddress, amount);

// Wrap (lock Foreign Assets, mint ERC20)
await wrapper.wrap(amount);
```

### Unwrap ERC20 Tokens

```javascript
const erc20 = await ethers.getContractAt("AjunaERC20", erc20Address);

// Approve wrapper to burn ERC20
await erc20.approve(wrapperAddress, amount);

// Unwrap (burn ERC20, withdraw Foreign Assets)
await wrapper.unwrap(amount);
```

## Key Features

### Security
- ✅ Role-based access control (OpenZeppelin)
- ✅ Only wrapper contract can mint/burn tokens
- ✅ Reentrancy protection
- ✅ Safe ERC20 operations

### Gas Optimization
- ✅ Minimal storage usage
- ✅ Efficient event emissions
- ✅ Optimized for PVM execution

### Standards Compliance
- ✅ ERC20 standard
- ✅ Polkadot Foreign Asset precompile interface
- ✅ OpenZeppelin contracts

## Troubleshooting

### Compilation Issues

If you encounter compilation errors:

```bash
# Clean and rebuild
npx hardhat clean
npm install --legacy-peer-deps
npx hardhat compile
```

### Local Node Issues

The local `revive-dev-node` doesn't pre-fund accounts. For testing:
- Use `npx hardhat test` (recommended)
- Or deploy to testnet with funded accounts

### Dependency Conflicts

This project uses `--legacy-peer-deps` due to compatibility between:
- `@parity/hardhat-polkadot` (Hardhat v2)
- `@nomicfoundation/hardhat-ethers` (v3.0.5)

## Technical Details

### Chain ID
- Local: `420420420`
- Westend Asset Hub: `420420421`

### Foreign Asset Precompile
- Address: `0x0000000000000000000000000000000000000400`
- Standard ERC20 interface for Foreign Assets

### Gas Configuration
- Local network: 50 gwei base fee (legacy transactions)
- Testnet: Dynamic gas pricing

## Development

### Add New Tests

Edit `test/wrapper.test.ts`:

```typescript
it("Should do something", async function () {
  const { wrapper, erc20, foreignAsset, owner } = await loadFixture(deployFixture);
  // Your test logic
});
```

### Modify Contracts

1. Edit contracts in `contracts/`
2. Compile: `npx hardhat compile`
3. Test: `npx hardhat test`
4. Deploy: `./scripts/deploy_testnet.sh`

## Resources

- [Polkadot Revive Documentation](https://github.com/paritytech/polkadot-sdk/tree/master/substrate/frame/revive)
- [Hardhat Polkadot Plugin](https://github.com/paritytech/hardhat-polkadot)
- [OpenZeppelin Contracts](https://docs.openzeppelin.com/contracts)

## License

ISC

## Support

For issues or questions:
1. Check the [Troubleshooting](#troubleshooting) section
2. Review test output: `npx hardhat test --verbose`
3. Check node logs: `./scripts/run_local_node.sh`

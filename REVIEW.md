# Ajuna Token Swap: Comprehensive Review

## 1. Architecture Overview

The system implements a **Mint-and-Lock (Wrap/Unwrap)** pattern with two contracts:

- **AjunaERC20**: A role-gated ERC20 token (Wrapped AJUN / wAJUN)
- **AjunaWrapper**: A treasury contract that locks foreign AJUN and mints/burns wAJUN

The approach is architecturally sound. The 1:1 backing invariant (`totalSupply(wAJUN) == foreignAsset.balanceOf(wrapper)`) is maintained by atomic deposit/withdraw operations. This is the correct pattern for a wrapped asset.

---

## 2. What Is Working Well

| Aspect | Details |
|--------|---------|
| **Core pattern** | Mint-and-Lock with burn-on-withdraw is correct and battle-tested |
| **Access control** | `AccessControl` from OpenZeppelin with `MINTER_ROLE` is properly used |
| **Reentrancy protection** | `ReentrancyGuard` on both `deposit()` and `withdraw()` |
| **Immutability** | `token` and `foreignAsset` are `immutable` — no storage slot, no proxy hijack vector |
| **Interface** | `IERC20Precompile` matches the Polkadot SDK precompile ABI exactly (confirmed against `polkadot-sdk/substrate/frame/assets/precompiles/src/lib.rs`) |
| **Deployment module** | Ignition module correctly wires up `grantRole(MINTER_ROLE, wrapper)` |
| **Test coverage** | Both wrap and unwrap flows are tested with proper event assertions |
| **Documentation** | Thorough spec document and README |

---

## 3. Critical Issues & Required Changes

### 3.1 SECURITY: `burn()` Can Burn Any User's Tokens Without ApprovalUser: Please review this implementation of a Token swap that in production should allow to swap a foreign Asset on Polkadot Asset hub which is the AJUN token to a ERC20 AJUN token (wAJUN). Provide a detailed description of what is working what needs to be changed to follow best practice state of the art and also security measures.

Also we need an insight on how to test and make sure we also have a corresponding way to visually test the thing.

GitHub Copilot:



Created 6 todos

Read [](file:///home/darkfriend/projects/antigravity/ajuna-tokenswap/contracts/AjunaWrapper.sol)

Read [](file:///home/darkfriend/projects/antigravity/ajuna-tokenswap/contracts/AjunaERC20.sol)

Read [](file:///home/darkfriend/projects/antigravity/ajuna-tokenswap/contracts/interfaces/IERC20Precompile.sol)

Read [](file:///home/darkfriend/projects/antigravity/ajuna-tokenswap/specs_v1.md#1-1), lines 1 to 300

Read [](file:///home/darkfriend/projects/antigravity/ajuna-tokenswap/specs_v1.md#300-300), lines 300 to 495

Read [](file:///home/darkfriend/projects/antigravity/ajuna-tokenswap/test/wrapper.test.ts)

Read [](file:///home/darkfriend/projects/antigravity/ajuna-tokenswap/hardhat.config.ts)

Read [](file:///home/darkfriend/projects/antigravity/ajuna-tokenswap/package.json)

Starting: *Review Solidity contracts* (2/6)

Read [](file:///home/darkfriend/projects/antigravity/ajuna-tokenswap/test-ui.html#1-1), lines 1 to 500

Read [](file:///home/darkfriend/projects/antigravity/ajuna-tokenswap/ignition/modules/AjunaWrapper.ts)

Read [](file:///home/darkfriend/projects/antigravity/ajuna-tokenswap/README.md#1-1), lines 1 to 100

Read [](file:///home/darkfriend/projects/antigravity/ajuna-tokenswap/README.md#100-100), lines 100 to 328

Read [](file:///home/darkfriend/projects/antigravity/ajuna-tokenswap/test-ui.html#500-500), lines 500 to 625

Now let me look at the remaining scripts and any other supporting files:

Read all shell scripts

Read [](file:///home/darkfriend/projects/antigravity/ajuna-tokenswap/scripts)

Read [](file:///home/darkfriend/projects/antigravity/ajuna-tokenswap/scripts/check_chain_id.ts)

Read [](file:///home/darkfriend/projects/antigravity/ajuna-tokenswap/scripts/check_dev_accounts.ts)

Read [](file:///home/darkfriend/projects/antigravity/ajuna-tokenswap/scripts/deploy_testnet.sh)

Read [](file:///home/darkfriend/projects/antigravity/ajuna-tokenswap/scripts/fund_account.ts)

Read [](file:///home/darkfriend/projects/antigravity/ajuna-tokenswap/scripts/generate_chain_spec.sh)

Read [](file:///home/darkfriend/projects/antigravity/ajuna-tokenswap/scripts/run_local_node.sh)

Read [](file:///home/darkfriend/projects/antigravity/ajuna-tokenswap/scripts/serve_ui.sh)

Read [](file:///home/darkfriend/projects/antigravity/ajuna-tokenswap/scripts/setup_node.sh)

Starting: *Write comprehensive review* (6/6)

Now let me also check the Polkadot SDK precompile source to see how the actual ERC20 precompile works:

Searched for files matching `**/frame/assets/precompiles/src/lib.rs`, 1 match

Read [](file:///home/darkfriend/projects/antigravity/ajuna-tokenswap/ERC20_Precombile.md#1-1), lines 1 to 50

Read [](file:///home/darkfriend/projects/antigravity/ajuna-tokenswap/HardHatEVM.md#1-1), lines 1 to 100

Read [](file:///home/darkfriend/projects/antigravity/ajuna-tokenswap/HardHatPVM.md#1-1), lines 1 to 100

Read [](file:///home/darkfriend/projects/antigravity/ajuna-tokenswap/ERC20_Precombile.md#50-50), lines 50 to 248

Read [](file:///home/darkfriend/projects/antigravity/ajuna-tokenswap/HardHatEVM.md#100-100), lines 100 to 150

Read [](file:///home/darkfriend/projects/antigravity/ajuna-tokenswap/HardHatPVM.md#100-100), lines 100 to 243

Now let me also quickly check the precompile source for the address mapping:

Read [](file:///home/darkfriend/projects/antigravity/ajuna-tokenswap/polkadot-sdk/substrate/frame/assets/precompiles/src/lib.rs#1-1), lines 1 to 100

Read [](file:///home/darkfriend/projects/antigravity/ajuna-tokenswap/LocalDevelopmentNode.md#1-1), lines 1 to 100

Read [](file:///home/darkfriend/projects/antigravity/ajuna-tokenswap/polkadot-sdk/substrate/frame/assets/precompiles/src/lib.rs#100-100), lines 100 to 326

Completed: *Write comprehensive review* (6/6)

Here is the comprehensive review:

---

# Ajuna Token Swap: Comprehensive Review

## 1. Architecture Overview

The system implements a **Mint-and-Lock (Wrap/Unwrap)** pattern with two contracts:

- **AjunaERC20**: A role-gated ERC20 token (Wrapped AJUN / wAJUN)
- **AjunaWrapper**: A treasury contract that locks foreign AJUN and mints/burns wAJUN

The approach is architecturally sound. The 1:1 backing invariant (`totalSupply(wAJUN) == foreignAsset.balanceOf(wrapper)`) is maintained by atomic deposit/withdraw operations. This is the correct pattern for a wrapped asset.

---

## 2. What Is Working Well

| Aspect | Details |
|--------|---------|
| **Core pattern** | Mint-and-Lock with burn-on-withdraw is correct and battle-tested |
| **Access control** | `AccessControl` from OpenZeppelin with `MINTER_ROLE` is properly used |
| **Reentrancy protection** | `ReentrancyGuard` on both `deposit()` and `withdraw()` |
| **Immutability** | `token` and `foreignAsset` are `immutable` — no storage slot, no proxy hijack vector |
| **Interface** | `IERC20Precompile` matches the Polkadot SDK precompile ABI exactly (confirmed against lib.rs) |
| **Deployment module** | Ignition module correctly wires up `grantRole(MINTER_ROLE, wrapper)` |
| **Test coverage** | Both wrap and unwrap flows are tested with proper event assertions |
| **Documentation** | Thorough spec document and README |

---

## 3. Critical Issues & Required Changes

### 3.1 SECURITY: `burn()` Can Burn Any User's Tokens Without Approval

**Severity: HIGH**

In AjunaERC20.sol:

```solidity
function burn(address from, uint256 amount) external onlyRole(MINTER_ROLE) {
    _burn(from, amount);
}
```

Any holder of `MINTER_ROLE` can burn tokens from **any** address without approval. Today only the Wrapper holds this role, and the Wrapper only calls `burn(msg.sender, amount)` in `withdraw()`, so the attack surface is limited. However:

- If a second contract is ever granted `MINTER_ROLE`, it could drain all users.
- This violates the principle of least privilege.

**Recommendation**: Require the user to `approve()` the wrapper first, then use `transferFrom + burn` in the wrapper, or split into two roles (`MINTER_ROLE` and `BURNER_ROLE`) and add an allowance check in `burn`:

```solidity
// Option A: Standard burnFrom pattern
function burnFrom(address from, uint256 amount) external onlyRole(MINTER_ROLE) {
    _spendAllowance(from, _msgSender(), amount);
    _burn(from, amount);
}

// Option B: Keep current burn but add a separate BURNER_ROLE
// (the spec actually mentions both MINTER_ROLE and BURNER_ROLE)
```

### 3.2 SECURITY: No Pausability

**Severity: MEDIUM**

If a vulnerability is discovered, there is no circuit breaker. Add OpenZeppelin's `Pausable` to the Wrapper:

```solidity
import "@openzeppelin/contracts/utils/Pausable.sol";

contract AjunaWrapper is Ownable, ReentrancyGuard, Pausable {
    function deposit(uint256 amount) external nonReentrant whenNotPaused { ... }
    function withdraw(uint256 amount) external nonReentrant whenNotPaused { ... }
    function pause() external onlyOwner { _pause(); }
    function unpause() external onlyOwner { _unpause(); }
}
```

### 3.3 SECURITY: No Emergency Rescue Function

**Severity: MEDIUM**

The spec mentions "Function to rescue other tokens" but it's commented out. If someone accidentally sends the wrong token to the Wrapper, it's stuck forever. Add:

```solidity
function rescueToken(address tokenAddr, address to, uint256 amount) external onlyOwner {
    require(tokenAddr != address(foreignAsset), "Cannot rescue locked asset");
    IERC20(tokenAddr).transfer(to, amount);
}
```

### 3.4 SECURITY: Immutable Foreign Asset Address vs. Runtime Upgrade Risk

**Severity: MEDIUM-HIGH**

The spec (Section 6.1) explicitly warns that precompile addresses can change with runtime upgrades on pallet-revive (still experimental). Yet `foreignAsset` is `immutable`. If the precompile address changes, all locked assets become inaccessible.

**Options**:
1. **Proxy pattern (UUPS/Transparent)**: Wrap the Wrapper behind a proxy so the logic can be migrated. This is the spec's own recommendation (Section 8).
2. **Governance-controlled address**: Make `foreignAsset` mutable but restricted to a multisig/governance timelock.

### 3.5 ISSUE: Missing `decimals()` Alignment

**Severity: MEDIUM**

`AjunaERC20` defaults to 18 decimals (ERC20 default). The AJUN native token on Ajuna Network uses **12 decimals**. The precompile docs explicitly warn that `name()`, `symbol()`, `decimals()` are **NOT available** on the precompile.

If AJUN has 12 decimals and wAJUN has 18 decimals, a 1:1 "amount" transfer creates a 10^6 scaling mismatch. The contract does no decimal conversion.

**Recommendation**: Override `decimals()` to match the native AJUN token:

```solidity
function decimals() public pure override returns (uint8) {
    return 12; // Must match AJUN native decimals
}
```

### 3.6 ISSUE: Missing `address(0)` Validation in Constructor

**Severity: LOW**

Both constructors accept addresses without validation:

```solidity
constructor(address _token, address _foreignAssetPrecompile) Ownable(msg.sender) {
    require(_token != address(0), "Invalid token address");
    require(_foreignAssetPrecompile != address(0), "Invalid precompile address");
    token = AjunaERC20(_token);
    foreignAsset = IERC20Precompile(_foreignAssetPrecompile);
}
```

---

## 4. Best Practice Gaps

### 4.1 Test-UI ABI Mismatch with Contracts

**Severity: HIGH (breaks visual testing)**

The test-ui.html uses function names that **do not exist** in the deployed contracts:

| UI calls | Actual contract function |
|----------|------------------------|
| `wrapper.wrap(amount)` | `wrapper.deposit(amount)` |
| `wrapper.unwrap(amount)` | `wrapper.withdraw(amount)` |
| Event `Wrapped` | Event `Deposited` |
| Event `Unwrapped` | Event `Withdrawn` |

The WRAPPER_ABI in the UI references `wrap`/`unwrap`, but the contract has `deposit`/`withdraw`. This means **the test UI will not work at all**.

### 4.2 Test-UI Uses Ethers v5 CDN but Project Uses Ethers v6

The HTML loads `ethers-5.7.2.umd.min.js` from CDN while the project dependency is ethers v6. The syntax (`ethers.utils.parseEther`, `ethers.providers.JsonRpcProvider`) is v5-style. This works since the UI is standalone, but creates a maintenance burden and inconsistency.

### 4.3 Missing `npm test` Script

package.json has:
```json
"test": "echo \"Error: no test specified\" && exit 1"
```

Should be:
```json
"test": "npx hardhat test"
```

### 4.4 Hardhat Config: Network Name Typo & Chain ID Inconsistency

In hardhat.config.ts:
- Network `hasura` seems like a typo (should be `local` or something else — there's already a `local` network defined).
- The `polkadotTestnet` uses chain ID `420420421` but the HardHatEVM.md documentation says `420420417`. This needs verification against the actual Westend Asset Hub.

### 4.5 No Event Indexing Beyond `user`

Events only index `user`. For production analytics and indexing, consider also indexing `amount` or adding a nonce:

```solidity
event Deposited(address indexed user, uint256 amount, uint256 timestamp);
event Withdrawn(address indexed user, uint256 amount, uint256 timestamp);
```

### 4.6 No `renounceRole` in Deployment

The spec (Section 7, Phase 4, Step D) recommends:
> `AjunaERC20.renounceRole(DEFAULT_ADMIN_ROLE, deployerAddress)` — Optional, but empfohlen für Dezentralisierung.

The Ignition module does **not** do this. After deployment, the deployer retains `DEFAULT_ADMIN_ROLE` and can grant `MINTER_ROLE` to any address, which would allow arbitrary minting. For production, the admin role should be transferred to a multisig or renounced.

### 4.7 Existential Deposit Not Handled in Deployment Script

The spec (Section 6.2) requires seeding the wrapper with 1–2 DOT to prevent account reaping. Neither the Ignition module nor the deploy script handles this.

---

## 5. Test Coverage Analysis

### Current State: Minimal

The test file has **only 2 tests**:
1. Wrap (deposit)
2. Unwrap (withdraw)

### Missing Test Cases (Recommended)

| # | Test Case | Priority |
|---|-----------|----------|
| 1 | Deposit with zero amount reverts | HIGH |
| 2 | Deposit without prior approval reverts | HIGH |
| 3 | Withdraw more than balance reverts | HIGH |
| 4 | Withdraw with zero amount reverts | HIGH |
| 5 | Non-MINTER cannot call mint/burn | HIGH |
| 6 | Invariant: `token.totalSupply() == foreignAsset.balanceOf(wrapper)` after every op | HIGH |
| 7 | Multiple users wrap/unwrap concurrently | MEDIUM |
| 8 | Owner-only functions (if pause/rescue added) | MEDIUM |
| 9 | Event parameter correctness | MEDIUM |
| 10 | Deployer cannot mint directly on ERC20 (no MINTER_ROLE) | HIGH |
| 11 | Edge case: wrapping `type(uint256).max` | LOW |

### Recommended Test Structure

```typescript
describe("AjunaWrapper System", function () {
  describe("Deployment", () => { /* constructor, roles, addresses */ });
  describe("Deposit (Wrap)", () => { /* happy path, no approval, zero amount, events */ });
  describe("Withdraw (Unwrap)", () => { /* happy path, insufficient balance, zero amount */ });
  describe("Access Control", () => { /* only wrapper can mint/burn, admin role */ });
  describe("Invariants", () => { /* 1:1 backing after sequences of ops */ });
  describe("Edge Cases", () => { /* reentrancy, large amounts, dust amounts */ });
});
```

---

## 6. Visual Testing (Test UI) — How to Fix and Use

### Current Problems

1. **ABI mismatch** (functions `wrap`/`unwrap` don't exist — should be `deposit`/`withdraw`)
2. **No contract deployment from UI** (it tells users to deploy via CLI, which is fine for dev)
3. **Foreign asset mock is missing** — the UI assumes a precompile at `0x400` but local Hardhat doesn't have one
4. **No approval for ERC20 unwrap button** — the `approveUnwrap()` function calls `erc20.approve(wrapper)`, but the current `burn()` implementation doesn't check allowance, making this a no-op

### Recommended Fix: Corrected ABI in test-ui.html

```javascript
const WRAPPER_ABI = [
    "function deposit(uint256 amount)",
    "function withdraw(uint256 amount)",
    "function token() view returns (address)",
    "function foreignAsset() view returns (address)",
    "event Deposited(address indexed user, uint256 amount)",
    "event Withdrawn(address indexed user, uint256 amount)",
];
```

And update the `wrap()`/`unwrap()` JS functions to call `deposit()`/`withdraw()`.

### Recommended Visual Testing Strategy

**Tier 1: Hardhat In-Memory (Unit Tests)**
```bash
npx hardhat test
```
This uses a mock ERC20 as a stand-in for the foreign asset precompile. Best for logic validation. Already works.

**Tier 2: Local PVM Node + Test UI**
1. Build and run the revive-dev-node: run_local_node.sh
2. Deploy contracts: `npx hardhat ignition deploy AjunaWrapper.ts --network local`
3. Serve the UI: serve_ui.sh
4. Open `http://localhost:8000/test-ui.html`
5. Paste deployed addresses, test wrap/unwrap visually

Problem: The local dev node does **not** have a real foreign asset precompile at `0x400`. You'd need to either:
- Deploy a mock ERC20 on the local node and use its address as the foreign asset
- Use a Chopsticks fork of the real AssetHub (as the spec recommends)

**Tier 3: Chopsticks Fork of Real AssetHub (Integration)**
This is the gold standard for pre-production testing. It forks real chain state including the actual AJUN foreign asset:
```bash
npx @acala-network/chopsticks@latest --endpoint wss://polkadot-asset-hub-rpc.polkadot.io
```

**Tier 4: Westend Testnet (Staging)**
Deploy to Westend Asset Hub with real network conditions.

---

## 7. Summary of Recommended Actions

### Must Fix (Before Any Production)

| # | Action | File |
|---|--------|------|
| 1 | Add approval check to `burn()` or use transferFrom+burn pattern | AjunaERC20.sol |
| 2 | Verify and match `decimals()` to AJUN native (likely 12) | AjunaERC20.sol |
| 3 | Add Pausable to Wrapper | AjunaWrapper.sol |
| 4 | Add address(0) checks in constructors | Both contracts |
| 5 | Fix test-ui.html ABI (`deposit`/`withdraw` not `wrap`/`unwrap`) | test-ui.html |
| 6 | Add comprehensive tests (at least 10+ cases) | wrapper.test.ts |
| 7 | Fix `npm test` script in package.json | package.json |
| 8 | Plan for upgradeability (proxy or migration path) | Architecture decision |

### Should Fix (Best Practice)

| # | Action |
|---|--------|
| 9 | Add emergency rescue function for accidentally sent tokens |
| 10 | Add `renounceRole` step to deployment (or transfer admin to multisig) |
| 11 | Seed wrapper with ED (existential deposit) in deployment script |
| 12 | Resolve hardhat config network name duplication (`hasura` vs `local`) |
| 13 | Verify Westend chain ID (420420421 vs 420420417) |

### Nice to Have

| # | Action |
|---|--------|
| 14 | Upgrade test-ui.html to ethers v6 for consistency |
| 15 | Add MetaMask/browser wallet support to test UI |
| 16 | Add Slither/Mythril static analysis to CI |
| 17 | Add NatSpec documentation to all public functions |
| 18 | Set up Chopsticks integration test script |

---

## 8. Architecture Diagram



The overall architecture is solid and the core Mint-and-Lock pattern is correctly implemented. The main risks fall into three categories:

1. **The `burn()` function being too permissive** — this is the most important security fix. Any `MINTER_ROLE` holder can burn arbitrary user tokens without their approval.

2. **Decimal mismatch** — if AJUN uses 12 decimals and wAJUN defaults to 18, the 1:1 amount mapping silently breaks value equivalence. This must be verified and aligned before mainnet.

3. **No upgrade path** — given that pallet-revive is still experimental and precompile addresses can shift with runtime upgrades, locking the treasury behind an immutable address is a significant operational risk. A proxy pattern or governance-controlled migration is strongly recommended.

The **test UI is currently broken** due to ABI mismatch (`wrap`/`unwrap` vs `deposit`/`withdraw`). Fixing this plus adding the recommended 10+ test cases would bring the project to a production-ready testing standard.

User: #createFile the plan as is into an untitled file (`untitled:plan-${camelCaseName}.prompt.md` without frontmatter) for further refinement.

GitHub Copilot:



Created [](untitled:plan-ajunaTokenSwap.prompt.md)

Created the plan as an untitled file. It's now open in the editor for further refinement.

Made changes.

User: Let's create a Plan on how to tackle all those findings, in the right order.

GitHub Copilot:

User: Let's create a Plan on how to tackle all those findings, in the right order.

GitHub Copilot:

User: Let's create a Plan on how to tackle all those findings, in the right order.

GitHub Copilot:

 Let me review the current findings and dependencies to sequence them properly.

Read [](file:///home/darkfriend/projects/antigravity/ajuna-tokenswap/contracts/AjunaERC20.sol)

Read [](file:///home/darkfriend/projects/antigravity/ajuna-tokenswap/contracts/AjunaWrapper.sol)

Read [](file:///home/darkfriend/projects/antigravity/ajuna-tokenswap/ignition/modules/AjunaWrapper.ts)

Before drafting the plan, I need to clarify a few decisions that affect sequencing:

Asked 4 questions (Burn, Upgrade, Decimals, Scope)

**Severity: HIGH**

In `contracts/AjunaERC20.sol`:

```solidity
function burn(address from, uint256 amount) external onlyRole(MINTER_ROLE) {
    _burn(from, amount);
}
```

Any holder of `MINTER_ROLE` can burn tokens from **any** address without approval. Today only the Wrapper holds this role, and the Wrapper only calls `burn(msg.sender, amount)` in `withdraw()`, so the attack surface is limited. However:

- If a second contract is ever granted `MINTER_ROLE`, it could drain all users.
- This violates the principle of least privilege.

**Recommendation**: Require the user to `approve()` the wrapper first, then use `transferFrom + burn` in the wrapper, or split into two roles (`MINTER_ROLE` and `BURNER_ROLE`) and add an allowance check in `burn`:

```solidity
// Option A: Standard burnFrom pattern
function burnFrom(address from, uint256 amount) external onlyRole(MINTER_ROLE) {
    _spendAllowance(from, _msgSender(), amount);
    _burn(from, amount);
}

// Option B: Keep current burn but add a separate BURNER_ROLE
// (the spec actually mentions both MINTER_ROLE and BURNER_ROLE)
```

### 3.2 SECURITY: No Pausability

**Severity: MEDIUM**

If a vulnerability is discovered, there is no circuit breaker. Add OpenZeppelin's `Pausable` to the Wrapper:

```solidity
import "@openzeppelin/contracts/utils/Pausable.sol";

contract AjunaWrapper is Ownable, ReentrancyGuard, Pausable {
    function deposit(uint256 amount) external nonReentrant whenNotPaused { ... }
    function withdraw(uint256 amount) external nonReentrant whenNotPaused { ... }
    function pause() external onlyOwner { _pause(); }
    function unpause() external onlyOwner { _unpause(); }
}
```

### 3.3 SECURITY: No Emergency Rescue Function

**Severity: MEDIUM**

The spec mentions "Function to rescue other tokens" but it's commented out. If someone accidentally sends the wrong token to the Wrapper, it's stuck forever. Add:

```solidity
function rescueToken(address tokenAddr, address to, uint256 amount) external onlyOwner {
    require(tokenAddr != address(foreignAsset), "Cannot rescue locked asset");
    IERC20(tokenAddr).transfer(to, amount);
}
```

### 3.4 SECURITY: Immutable Foreign Asset Address vs. Runtime Upgrade Risk

**Severity: MEDIUM-HIGH**

The spec (Section 6.1) explicitly warns that precompile addresses can change with runtime upgrades on pallet-revive (still experimental). Yet `foreignAsset` is `immutable`. If the precompile address changes, all locked assets become inaccessible.

**Options**:
1. **Proxy pattern (UUPS/Transparent)**: Wrap the Wrapper behind a proxy so the logic can be migrated. This is the spec's own recommendation (Section 8).
2. **Governance-controlled address**: Make `foreignAsset` mutable but restricted to a multisig/governance timelock.

### 3.5 ISSUE: Missing `decimals()` Alignment

**Severity: MEDIUM**

`AjunaERC20` defaults to 18 decimals (ERC20 default). The AJUN native token on Ajuna Network uses **12 decimals**. The precompile docs explicitly warn that `name()`, `symbol()`, `decimals()` are **NOT available** on the precompile.

If AJUN has 12 decimals and wAJUN has 18 decimals, a 1:1 "amount" transfer creates a 10^6 scaling mismatch. The contract does no decimal conversion.

**Recommendation**: Override `decimals()` to match the native AJUN token:

```solidity
function decimals() public pure override returns (uint8) {
    return 12; // Must match AJUN native decimals
}
```

### 3.6 ISSUE: Missing `address(0)` Validation in Constructor

**Severity: LOW**

Both constructors accept addresses without validation:

```solidity
constructor(address _token, address _foreignAssetPrecompile) Ownable(msg.sender) {
    require(_token != address(0), "Invalid token address");
    require(_foreignAssetPrecompile != address(0), "Invalid precompile address");
    token = AjunaERC20(_token);
    foreignAsset = IERC20Precompile(_foreignAssetPrecompile);
}
```

---

## 4. Best Practice Gaps

### 4.1 Test-UI ABI Mismatch with Contracts

**Severity: HIGH (breaks visual testing)**

The `test-ui.html` uses function names that **do not exist** in the deployed contracts:

| UI calls | Actual contract function |
|----------|------------------------|
| `wrapper.wrap(amount)` | `wrapper.deposit(amount)` |
| `wrapper.unwrap(amount)` | `wrapper.withdraw(amount)` |
| Event `Wrapped` | Event `Deposited` |
| Event `Unwrapped` | Event `Withdrawn` |

The WRAPPER_ABI in the UI references `wrap`/`unwrap`, but the contract has `deposit`/`withdraw`. This means **the test UI will not work at all**.

### 4.2 Test-UI Uses Ethers v5 CDN but Project Uses Ethers v6

The HTML loads `ethers-5.7.2.umd.min.js` from CDN while the project dependency is ethers v6. The syntax (`ethers.utils.parseEther`, `ethers.providers.JsonRpcProvider`) is v5-style. This works since the UI is standalone, but creates a maintenance burden and inconsistency.

### 4.3 Missing `npm test` Script

`package.json` has:
```json
"test": "echo \"Error: no test specified\" && exit 1"
```

Should be:
```json
"test": "npx hardhat test"
```

### 4.4 Hardhat Config: Network Name Typo & Chain ID Inconsistency

In `hardhat.config.ts`:
- Network `hasura` seems like a typo (should be `local` or something else — there's already a `local` network defined).
- The `polkadotTestnet` uses chain ID `420420421` but the `HardHatEVM.md` documentation says `420420417`. This needs verification against the actual Westend Asset Hub.

### 4.5 No Event Indexing Beyond `user`

Events only index `user`. For production analytics and indexing, consider also indexing `amount` or adding a nonce:

```solidity
event Deposited(address indexed user, uint256 amount, uint256 timestamp);
event Withdrawn(address indexed user, uint256 amount, uint256 timestamp);
```

### 4.6 No `renounceRole` in Deployment

The spec (Section 7, Phase 4, Step D) recommends:
> `AjunaERC20.renounceRole(DEFAULT_ADMIN_ROLE, deployerAddress)` — Optional, but empfohlen für Dezentralisierung.

The Ignition module does **not** do this. After deployment, the deployer retains `DEFAULT_ADMIN_ROLE` and can grant `MINTER_ROLE` to any address, which would allow arbitrary minting. For production, the admin role should be transferred to a multisig or renounced.

### 4.7 Existential Deposit Not Handled in Deployment Script

The spec (Section 6.2) requires seeding the wrapper with 1–2 DOT to prevent account reaping. Neither the Ignition module nor the deploy script handles this.

---

## 5. Test Coverage Analysis

### Current State: Minimal

The test file has **only 2 tests**:
1. Wrap (deposit)
2. Unwrap (withdraw)

### Missing Test Cases (Recommended)

| # | Test Case | Priority |
|---|-----------|----------|
| 1 | Deposit with zero amount reverts | HIGH |
| 2 | Deposit without prior approval reverts | HIGH |
| 3 | Withdraw more than balance reverts | HIGH |
| 4 | Withdraw with zero amount reverts | HIGH |
| 5 | Non-MINTER cannot call mint/burn | HIGH |
| 6 | Invariant: `token.totalSupply() == foreignAsset.balanceOf(wrapper)` after every op | HIGH |
| 7 | Multiple users wrap/unwrap concurrently | MEDIUM |
| 8 | Owner-only functions (if pause/rescue added) | MEDIUM |
| 9 | Event parameter correctness | MEDIUM |
| 10 | Deployer cannot mint directly on ERC20 (no MINTER_ROLE) | HIGH |
| 11 | Edge case: wrapping `type(uint256).max` | LOW |

### Recommended Test Structure

```typescript
describe("AjunaWrapper System", function () {
  describe("Deployment", () => { /* constructor, roles, addresses */ });
  describe("Deposit (Wrap)", () => { /* happy path, no approval, zero amount, events */ });
  describe("Withdraw (Unwrap)", () => { /* happy path, insufficient balance, zero amount */ });
  describe("Access Control", () => { /* only wrapper can mint/burn, admin role */ });
  describe("Invariants", () => { /* 1:1 backing after sequences of ops */ });
  describe("Edge Cases", () => { /* reentrancy, large amounts, dust amounts */ });
});
```

---

## 6. Visual Testing (Test UI) — How to Fix and Use

### Current Problems

1. **ABI mismatch** (functions `wrap`/`unwrap` don't exist — should be `deposit`/`withdraw`)
2. **No contract deployment from UI** (it tells users to deploy via CLI, which is fine for dev)
3. **Foreign asset mock is missing** — the UI assumes a precompile at `0x400` but local Hardhat doesn't have one
4. **No approval for ERC20 unwrap button** — the `approveUnwrap()` function calls `erc20.approve(wrapper)`, but the current `burn()` implementation doesn't check allowance, making this a no-op

### Recommended Fix: Corrected ABI in test-ui.html

```javascript
const WRAPPER_ABI = [
    "function deposit(uint256 amount)",
    "function withdraw(uint256 amount)",
    "function token() view returns (address)",
    "function foreignAsset() view returns (address)",
    "event Deposited(address indexed user, uint256 amount)",
    "event Withdrawn(address indexed user, uint256 amount)",
];
```

And update the `wrap()`/`unwrap()` JS functions to call `deposit()`/`withdraw()`.

### Recommended Visual Testing Strategy

**Tier 1: Hardhat In-Memory (Unit Tests)**
```bash
npx hardhat test
```
This uses a mock ERC20 as a stand-in for the foreign asset precompile. Best for logic validation. Already works.

**Tier 2: Local PVM Node + Test UI**
1. Build and run the revive-dev-node: `./scripts/run_local_node.sh`
2. Deploy contracts: `npx hardhat ignition deploy ./ignition/modules/AjunaWrapper.ts --network local`
3. Serve the UI: `./scripts/serve_ui.sh`
4. Open `http://localhost:8000/test-ui.html`
5. Paste deployed addresses, test wrap/unwrap visually

Problem: The local dev node does **not** have a real foreign asset precompile at `0x400`. You'd need to either:
- Deploy a mock ERC20 on the local node and use its address as the foreign asset
- Use a Chopsticks fork of the real AssetHub (as the spec recommends)

**Tier 3: Chopsticks Fork of Real AssetHub (Integration)**
This is the gold standard for pre-production testing. It forks real chain state including the actual AJUN foreign asset:
```bash
npx @acala-network/chopsticks@latest --endpoint wss://polkadot-asset-hub-rpc.polkadot.io
```

**Tier 4: Westend Testnet (Staging)**
Deploy to Westend Asset Hub with real network conditions.

---

## 7. Summary of Recommended Actions

### Must Fix (Before Any Production)

| # | Action | File |
|---|--------|------|
| 1 | Add approval check to `burn()` or use transferFrom+burn pattern | `contracts/AjunaERC20.sol` |
| 2 | Verify and match `decimals()` to AJUN native (likely 12) | `contracts/AjunaERC20.sol` |
| 3 | Add Pausable to Wrapper | `contracts/AjunaWrapper.sol` |
| 4 | Add address(0) checks in constructors | Both contracts |
| 5 | Fix test-ui.html ABI (`deposit`/`withdraw` not `wrap`/`unwrap`) | `test-ui.html` |
| 6 | Add comprehensive tests (at least 10+ cases) | `test/wrapper.test.ts` |
| 7 | Fix `npm test` script in package.json | `package.json` |
| 8 | Plan for upgradeability (proxy or migration path) | Architecture decision |

### Should Fix (Best Practice)

| # | Action |
|---|--------|
| 9 | Add emergency rescue function for accidentally sent tokens |
| 10 | Add `renounceRole` step to deployment (or transfer admin to multisig) |
| 11 | Seed wrapper with ED (existential deposit) in deployment script |
| 12 | Resolve hardhat config network name duplication (`hasura` vs `local`) |
| 13 | Verify Westend chain ID (420420421 vs 420420417) |

### Nice to Have

| # | Action |
|---|--------|
| 14 | Upgrade test-ui.html to ethers v6 for consistency |
| 15 | Add MetaMask/browser wallet support to test UI |
| 16 | Add Slither/Mythril static analysis to CI |
| 17 | Add NatSpec documentation to all public functions |
| 18 | Set up Chopsticks integration test script |

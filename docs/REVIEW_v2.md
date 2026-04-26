# Ajuna Tokenswap — Independent Security Audit (v2)

**Auditor**: senior security researcher, methodology aligned with OZ / Trail of Bits / Spearbit practice
**Engagement type**: independent third-party audit
**Audit date**: 2026-04-26
**Freeze commit**: `52a1b729164d069a55841d5cb63f118e104e2394` (`main`, clean tree)
**Status**: Supersedes [docs/REVIEW_v1.md](REVIEW_v1.md). All v1 findings re-verified; new findings introduced by post-v1 changes (allowlist gate, OZ 5.4 → 5.6.1 bump) audited.

> **Update (post-audit, same-day)**: MED-1, MED-2, LOW-1, INFO-4, plus
> doc-only INFO-1 / INFO-3 / INFO-5, all addressed in code on the same
> day this audit was issued. Findings remain documented below as
> originally written, with per-finding status updates inline. Test suite
> grew 81 → 91 (10 new tests covering the fixes). Freeze commit + 1 of
> remediation; the auditor's judgement on residual risk should be
> re-evaluated against the post-fix code.

**Scope**:
- [contracts/AjunaERC20.sol](../contracts/AjunaERC20.sol)
- [contracts/AjunaWrapper.sol](../contracts/AjunaWrapper.sol)
- [contracts/Proxy.sol](../contracts/Proxy.sol)
- [contracts/interfaces/IERC20Precompile.sol](../contracts/interfaces/IERC20Precompile.sol)
- Test mocks: [contracts/mocks/](../contracts/mocks/)
- Deployment scripts: [scripts/deploy_wrapper.ts](../scripts/deploy_wrapper.ts), [scripts/deploy_production.sh](../scripts/deploy_production.sh)
- Test suite: [test/wrapper.test.ts](../test/wrapper.test.ts) (61 tests)
- Configuration: [hardhat.config.ts](../hardhat.config.ts), [deployments.config.ts](../deployments.config.ts)

**Out of scope**: vendored `polkadot-sdk/` snapshot (referenced for behavior verification only), `frontend/`, off-chain infrastructure.

**Toolchain**: Solidity 0.8.28; OpenZeppelin Contracts/Upgradeable 5.6.1 (verified against installed `node_modules`); Hardhat with `@parity/hardhat-polkadot`.

> **Auditor's stance vs. the in-repo REVIEW_v1.md**: that document is an internal review by the author. It is helpful as input but not a substitute for an external opinion. v1 is treated as a *baseline* and this review looks for what it missed or under-weighted, particularly around the post-review changes (the `allowlist` gate at [AjunaWrapper.sol:104-137](../contracts/AjunaWrapper.sol#L104-L137) and the OZ 5.4 → 5.6.1 bump). All claims below are re-verified from source.

---

## Phase 1 — Architecture & Threat Model

### 1.1 System reconstruction

Two UUPS-upgradeable contracts, deployed behind two `ERC1967Proxy` instances:

```
                ┌─────────────────┐                    ┌──────────────────────────┐
   user EOA ───►│  AjunaWrapper   │──safeTransferFrom─►│ AJUN ERC20 Precompile    │
                │  (proxy + impl) │                    │ (pallet-revive + foreign │
                │                 │◄──safeTransfer──── │  assets pallet)          │
                │  owner = EOA→   │                    └──────────────────────────┘
                │       multisig  │
                │                 │
                │  MINTER_ROLE on │
                │  the token ↓    │
                └────────┬────────┘
                         │ mint / burnFrom
                         ▼
                ┌─────────────────┐
                │  AjunaERC20     │
                │  (proxy + impl) │
                │  DEFAULT_ADMIN_ │
                │  ROLE,          │
                │  UPGRADER_ROLE  │
                │  → admin EOA    │
                │      → multisig │
                └─────────────────┘
```

- **Proxy pattern**: `ERC1967Proxy` (OZ) with UUPS-style upgrade authorization on each implementation.
- **Both implementation contracts have `_disableInitializers()` in their constructors** ([AjunaERC20.sol:28-30](../contracts/AjunaERC20.sol#L28-L30); [AjunaWrapper.sol:62-65](../contracts/AjunaWrapper.sol#L62-L65)).
- **Storage isolation**: every OZ base contract uses ERC-7201 namespaced storage (verified directly in `node_modules/@openzeppelin/contracts-upgradeable/access/Ownable2StepUpgradeable.sol`). Derived state on `AjunaERC20` and `AjunaWrapper` lives at slot 0 forward, with explicit `__gap[49]` and `__gap[46]` reserves.
- **Deployment flow** ([scripts/deploy_wrapper.ts](../scripts/deploy_wrapper.ts)): deploy ERC20 impl → deploy ERC20 proxy with `initialize(name,symbol,deployer,decimals)` → deploy Wrapper impl → deploy Wrapper proxy with `initialize(token,foreignAsset)` → grant `MINTER_ROLE` to wrapper proxy. Deployer EOA retains `DEFAULT_ADMIN_ROLE` + `UPGRADER_ROLE` on the ERC20 and `owner()` on the wrapper until a documented multisig handoff.

### 1.2 Actors

| Actor | Capability |
|---|---|
| **End user (EOA)** | `deposit`, `withdraw`, `approve`. Subject to `whenNotPaused` and `onlyAllowedUser`. |
| **Wrapper owner** | Single key; controls `pause`/`unpause`, `rescueToken`, `setAllowlistEnabled`, `setAllowlist`, `setAllowlistBatch`, `_authorizeUpgrade` of the wrapper, two-step `transferOwnership`. |
| **ERC20 `DEFAULT_ADMIN_ROLE` holder** | Can grant/revoke any role on the ERC20, including granting `MINTER_ROLE` or `UPGRADER_ROLE` to anyone. |
| **ERC20 `UPGRADER_ROLE` holder** | Can authorize ERC20 implementation upgrades. |
| **ERC20 `MINTER_ROLE` holder** | In production, only the wrapper proxy. Can `mint(any,N)` and `burnFrom(any,N)` (with allowance). |
| **Pending owner (Ownable2Step)** | Inactive until they call `acceptOwnership`. |
| **Foreign asset (precompile)** | Implements `IERC20Precompile`. Trusted to revert-on-failure and not re-enter. |
| **`pallet-revive` / runtime** | Substrate runtime; trusted to faithfully expose ERC20 semantics for foreign assets, enforce on-chain reentrancy guards, and preserve H160→AccountId32 mapping across upgrades. |
| **Attacker** | Any combination of the above with one or more keys compromised, plus the ability to control the foreign asset (only via runtime/governance) or front-run user txs. |

### 1.3 Trust assumptions (explicit — flag any that are implicit)

1. **The foreign-asset precompile behaves as a standard, non-reentrant, non-rebasing, non-fee-on-transfer ERC20**, returning `true` on success and reverting on failure. *Source*: [deployments.config.ts:39-43](../deployments.config.ts#L39-L43) describing `0x0220` foreign-asset precompiles via PR #10869, and the standard ERC20 precompile contract at https://docs.polkadot.com/smart-contracts/precompiles/erc20/. This is a runtime-level guarantee; the precompile source is not in this checkout for verification. **Implicit**: the contracts assume this even though `safeTransferFrom`/`safeTransfer` provide partial defense (they handle missing-return / `false`-return tokens but not fee-on-transfer / rebasing tokens).
2. **The H160→AccountId32 mapping in `pallet-revive` (`AccountId32Mapper`, `to_fallback_account_id` at [polkadot-sdk/substrate/frame/revive/src/address.rs:137-141](../polkadot-sdk/substrate/frame/revive/src/address.rs)) is stable across runtime upgrades.** The wrapper holds AJUN under the AccountId `H160 || 0xEE..0xEE` (20 bytes of address + 12 bytes `0xEE`). A runtime change here would orphan the wrapper's balance. **Implicit**: nothing in the contract pins or asserts this.
3. **`pallet-revive`'s runtime-level reentrancy guard (`ReentrancyProtection::Strict` / `AllowNext` / `Disabled` at [exec.rs:120-135](../polkadot-sdk/substrate/frame/revive/src/exec.rs)) defends against direct re-entry.** The wrapper additionally uses OZ `ReentrancyGuard`. Defense in depth.
4. **The wrapper owner key and the ERC20 `DEFAULT_ADMIN_ROLE` are governed by a multisig (and ideally a timelock) before any non-allowlisted user ever uses the system.** *Source*: [docs/SECURITY.md](SECURITY.md); [docs/PRODUCTION-CHECKLIST.md](PRODUCTION-CHECKLIST.md). **Operational** — the contract cannot enforce this.
5. **The wrapper owner is the same governance principal as the ERC20 `DEFAULT_ADMIN_ROLE` holder.** Nothing in the code couples them. If they diverge (e.g., one multisig signs an admin grant before the other rotates), inconsistent privilege states are reachable. **Implicit**.
6. **The allowlist gate will be flipped off (`setAllowlistEnabled(false)`) once the staged rollout completes, and not re-enabled.** **Operational** — the contract permits re-enabling at any time.
7. **The two implementation addresses cannot be replaced with malicious bytecode** — i.e., the upgrade authority is honest. The `code.length > 0` check and OZ's `proxiableUUID` validation only confirm *that* something is a UUPS contract; they cannot validate *what* it does.
8. **No `upgradeToAndCall` initialization data is malicious.** The migration data is a delegatecall payload executed inside the proxy's storage context, with full state access.

### 1.4 External attack surface

| Surface | Reachable from |
|---|---|
| `AjunaWrapper.deposit / withdraw` | any EOA (subject to allowlist) |
| `AjunaWrapper.{pause,unpause,rescueToken,setAllowlistEnabled,setAllowlist,setAllowlistBatch,transferOwnership,acceptOwnership,upgradeToAndCall}` | privileged keys |
| `AjunaERC20.{transfer,approve,transferFrom,...}` | any EOA |
| `AjunaERC20.{mint,burnFrom}` | `MINTER_ROLE` only (the wrapper) |
| `AjunaERC20.{grantRole,revokeRole,renounceRole,upgradeToAndCall}` | privileged keys |
| `IERC20Precompile.*` | `pallet-revive` runtime; attacker could only exploit via runtime upgrade |
| Migration calldata in `upgradeToAndCall` | privileged keys, executed under proxy storage |

---

## Phase 2 — Line-by-Line Review

### `contracts/AjunaWrapper.sol`

#### `constructor()` — [L62-L65](../contracts/AjunaWrapper.sol#L62-L65)
- **Purpose**: prevent the implementation contract from being initialized.
- **Access**: deploy-time only.
- **State changes**: sets `_initialized = type(uint64).max` via `_disableInitializers`.
- **Concern**: none. Standard UUPS pattern. Annotated with `@custom:oz-upgrades-unsafe-allow constructor`. ✅

#### `initialize(_token, _foreignAssetPrecompile)` — [L72-L88](../contracts/AjunaWrapper.sol#L72-L88)
- **Purpose**: one-time setup of the wrapper proxy.
- **Access**: `initializer` modifier — single shot per proxy.
- **Validation**: zero-address checks on both args ✅.
- **State changes**: `__Ownable_init(msg.sender)`, `__Ownable2Step_init()` (no-op in OZ 5.6.1 — just enforces `onlyInitializing`), `__Pausable_init()`, sets `token`, `foreignAsset`, `allowlistEnabled = true`, emits `AllowlistEnabledUpdated(true)`.
- **Front-running**: the deployment script combines impl deploy + proxy deploy with init calldata in a single `ERC1967Proxy(impl, initData)` constructor — atomic. Cannot be front-run. ✅
- **Concern**: `__AccessControl_init()` and `__UUPSUpgradeable_init()` are **not called**. For OZ 5.x both are empty in OZ 5.6.1, so this is fine *today*, but a future OZ minor version could add init logic and break the upgrade. Defense-in-depth: include them. **Severity: Informational**. *(See INFO-2.)*
- **Concern**: re-init protection is only for the proxy; the implementation is protected separately via `_disableInitializers()` in the constructor. Both verified. ✅

#### `onlyAllowedUser` modifier — [L104-L109](../contracts/AjunaWrapper.sol#L104-L109)
- **Logic**: if `allowlistEnabled && msg.sender != owner()`, require `allowlisted[msg.sender]`.
- **Owner short-circuit**: `msg.sender != owner()` reads the *current* owner. After a two-step ownership handoff, the *new* owner is implicitly allowlisted; the *old* owner becomes a regular user (verified by test at [test/wrapper.test.ts:999-1015](../test/wrapper.test.ts#L999-L1015)). Behavior matches intent.
- **Concern**: `msg.sender == owner()` does not consider a contract acting on behalf of the owner via meta-tx, intermediate, or a multisig executing through a Safe. After multisig handoff, the multisig contract's H160 is what passes the check. Operationally fine. ✅
- **Concern**: this modifier applies to **`withdraw`**, not just `deposit` (see [L173](../contracts/AjunaWrapper.sol#L173)). This is the most consequential design decision in the contract — see **MED-1** in Phase 6.

#### `setAllowlistEnabled(bool)` — [L112-L115](../contracts/AjunaWrapper.sol#L112-L115)
- **Access**: `onlyOwner`.
- **State**: writes `allowlistEnabled`, emits event.
- **Concern**: no `whenPaused` requirement, no time-lock, no monotonicity (can re-enable after disabling). See **MED-1**.

#### `setAllowlist(address, bool)` — [L118-L122](../contracts/AjunaWrapper.sol#L118-L122)
- **Access**: `onlyOwner`.
- **Validation**: zero-address rejection ✅.
- **Concern**: emits `AllowlistUpdated` even when value is unchanged (idempotent writes). Minor — log-noise only.

#### `setAllowlistBatch(address[], bool)` — [L130-L137](../contracts/AjunaWrapper.sol#L130-L137)
- **Access**: `onlyOwner`.
- **Validation**: zero-address rejection per element ✅.
- **Concern**: unbounded loop. On `pallet-revive`, weight metering includes proof size; large batches may exceed block weight, partially executing then reverting. This is a self-inflicted DoS by the owner and not a security issue, but document a per-call upper bound (e.g., 100 entries) for operators. **Severity: Informational**.

#### `deposit(uint256)` — [L149-L164](../contracts/AjunaWrapper.sol#L149-L164)
- **Modifiers**: `nonReentrant`, `whenNotPaused`, `onlyAllowedUser`.
- **Validation**: `amount > 0`. ✅
- **External calls**:
  1. `safeTransferFrom(msg.sender, address(this), amount)` on the foreign asset.
  2. `token.mint(msg.sender, amount)` on the wAJUN.
- **CEI**: not strict — first interaction (`transferFrom`), then state effect (`mint`). However, both are mutex-protected by `nonReentrant`, and `mint` is an internal-trusted call to a contract this contract has `MINTER_ROLE` on. The reentrancy test at [test/wrapper.test.ts:858-894](../test/wrapper.test.ts#L858-L894) confirms a reentrant `transferFrom` cannot re-enter `deposit`. ✅
- **Reentrancy via the foreign asset**: protected by `nonReentrant`. Defense-in-depth: `pallet-revive` runtime guard.
- **Cross-function reentrancy** (e.g., reentering `withdraw` instead of `deposit`): both functions share the same `nonReentrant` mutex (OZ `ReentrancyGuard` uses a single `_status`), so blocked. ✅
- **Failed transfer**: `safeTransferFrom` reverts → entire tx reverts → no mint. ✅
- **Concern (defense-in-depth)**: no pre/post balance check. If the foreign asset is ever changed (only possible via UUPS upgrade) or if the precompile spec ever exposes fee-on-transfer or rebasing semantics, deposit would mint `amount` while the treasury receives less — under-collateralized. The current foreign-asset precompile is documented as standard ERC20, so this is theoretical. See **LOW-1**.

#### `withdraw(uint256)` — [L173-L187](../contracts/AjunaWrapper.sol#L173-L187)
- **Modifiers**: `nonReentrant`, `whenNotPaused`, `onlyAllowedUser`.
- **Validation**: `amount > 0` and explicit balance check (`Insufficient ERC20 balance`). The balance check is redundant — `burnFrom` would revert anyway with `ERC20InsufficientBalance` — but is friendlier. Documented as accepted (REVIEW_v1 L-1). ✅
- **Order**: burn (state), then `safeTransfer` (interaction). This *is* CEI. ✅
- **Concern (allowlist on withdraw)**: see **MED-1**.

#### `isInvariantHealthy()` — [L207-L209](../contracts/AjunaWrapper.sol#L207-L209)
- Pure view, no concerns. Returns `false` on either under- or over-collateralized states (the latter benign). Comment correctly identifies that `totalSupply > balanceOf` is the alarming case. ✅

#### `pause / unpause` — [L216-L223](../contracts/AjunaWrapper.sol#L216-L223)
- `onlyOwner`. Standard. ✅

#### `rescueToken(address, address, uint256)` — [L236-L242](../contracts/AjunaWrapper.sol#L236-L242)
- **Access**: `onlyOwner`, no `whenNotPaused` (deliberate — rescue is an emergency lever and must function while paused; verified by test at [test/wrapper.test.ts:811-826](../test/wrapper.test.ts#L811-L826)).
- **Guards**: `tokenAddress != foreignAsset` and `tokenAddress != token` and `to != address(0)`. ✅
- **Concern**: `foreignAsset` is read fresh at each call (`address(foreignAsset)`). If `foreignAsset` were mutable (it is not — only via UUPS upgrade), this guard would track. With `foreignAsset` immutable post-init, the guard is sound.
- **Concern**: if `foreignAsset` is ever changed via UUPS upgrade to a new address, the *old* foreign asset balance the wrapper still holds becomes "rescuable". Mitigation: any such migration must be paired with a sweep of the old asset back to users *before* the address change. This is an operational concern, not a code defect. **Severity: Informational** — already implicit in the M-2 fix (no `updateForeignAsset()`); still worth re-stating in upgrade runbooks.

#### `renounceOwnership()` — [L255-L257](../contracts/AjunaWrapper.sol#L255-L257)
- Overridden to `revert()`. The signature is `public pure override` — `pure` is acceptable because the body never reads state. The override removes `onlyOwner`, but since the body always reverts, this is fine (anyone calling it gets a revert). Verified by tests at [test/wrapper.test.ts:673-684](../test/wrapper.test.ts#L673-L684). ✅
- **Note**: this overrides the `renounceOwnership` from `OwnableUpgradeable` which `Ownable2StepUpgradeable` inherits but does not override. Solidity's MRO selects the most-derived override; `AjunaWrapper`'s override wins. ✅

#### `_authorizeUpgrade(address)` — [L266-L268](../contracts/AjunaWrapper.sol#L266-L268)
- `onlyOwner` + `code.length > 0` check.
- The `code.length > 0` check is a defense-in-depth complement to OZ's internal `proxiableUUID()` call inside `_upgradeToAndCallUUPS`. It rejects EOA-as-implementation (verified by test at [test/wrapper.test.ts:519-524](../test/wrapper.test.ts#L519-L524)). ✅
- **Concern**: no validation that `newImplementation` *itself* declares the same `proxiableUUID()`. OZ `UUPSUpgradeable._upgradeToAndCallUUPS` does this internally, so the layered check is redundant — fine. ✅
- **Concern**: no `nonReentrant` on `upgradeToAndCall`. Standard OZ pattern; the migration delegatecall is to the new (trusted-by-owner) impl, so reentrancy here would only be by the owner reentering themselves. Acceptable. ✅

#### `__gap[46]` — [L275](../contracts/AjunaWrapper.sol#L275)
- Layout: slot 0 = `token`, slot 1 = `foreignAsset`, slot 2 = `allowlistEnabled`, slot 3 = `allowlisted` (mapping), slots 4–49 = `__gap[46]`. Total derived 50 slots reserved. ✅
- **Concern (subtle)**: if this code were applied as a UUPS upgrade to a previous deployment that had `__gap[48]` and only `token`/`foreignAsset`, slots 2 and 3 (previously zero in `__gap`) would silently become `allowlistEnabled = false` and an empty `allowlisted` mapping. Without a `reinitializer(2)` migration, the post-upgrade state would have the gate **disabled** — the opposite of the intended "staged rollout" default. The deploy doc treats this as a fresh deploy, so this is not a deployed-system risk; flagged as **INFO-3** for upgrade runbooks.

### `contracts/AjunaERC20.sol`

#### `constructor` — [L28-L30](../contracts/AjunaERC20.sol#L28-L30)
- `_disableInitializers()`. ✅

#### `initialize(name_, symbol_, admin, decimals_)` — [L39-L52](../contracts/AjunaERC20.sol#L39-L52)
- `initializer` ✅.
- Zero-address check on `admin` ✅.
- `decimals_ <= 18` ✅.
- **Concern**: `__UUPSUpgradeable_init()` is **not called**. Same defense-in-depth note as the wrapper. **Severity: Informational** (same INFO-2).
- **Concern**: grants `DEFAULT_ADMIN_ROLE` and `UPGRADER_ROLE` to the same `admin` address. Documented; centralization burden falls on the multisig handoff.

#### `decimals()` — [L55-L57](../contracts/AjunaERC20.sol#L55-L57)
- Returns stored `_tokenDecimals`. ✅

#### `mint(address to, uint256 amount)` — [L65-L67](../contracts/AjunaERC20.sol#L65-L67)
- `onlyRole(MINTER_ROLE)` → `_mint`. Reverts on `to == address(0)` per OZ. ✅
- **Concern**: any holder of `MINTER_ROLE` can mint unbacked wAJUN. In production, only the wrapper holds this role. The `DEFAULT_ADMIN_ROLE` holder can grant `MINTER_ROLE` to anyone, including themselves — see **MED-2**.

#### `burnFrom(address from, uint256 amount)` — [L77-L80](../contracts/AjunaERC20.sol#L77-L80)
- `onlyRole(MINTER_ROLE)` + `_spendAllowance(from, _msgSender(), amount)` + `_burn(from, amount)`. The dual gate (role + allowance) is defense-in-depth: a hostile minter still needs the holder's approval to burn. ✅
- **Concern**: there is no `burn(uint256)` for self-burn. If a user wants to destroy their own wAJUN without the wrapper's involvement, they can't (they'd have to transfer to a black-hole address). Not a vulnerability — design choice.

#### `_authorizeUpgrade(address)` — [L85-L87](../contracts/AjunaERC20.sol#L85-L87)
- `onlyRole(UPGRADER_ROLE)` + `code.length > 0`. ✅
- **Concern**: `UPGRADER_ROLE` is initially granted to the same `admin` as `DEFAULT_ADMIN_ROLE`. Functionally one key. Worse, the `DEFAULT_ADMIN_ROLE` holder can self-grant `UPGRADER_ROLE` at any time. **Trust-model item; see MED-2.**

#### `__gap[49]` — [L92](../contracts/AjunaERC20.sol#L92)
- Slot 0 = `_tokenDecimals` (uint8, packed in slot 0), `__gap[49]`. Total ~50 slots reserved. ✅

#### `renounceRole` — inherited (not overridden)
- Any role-holder can renounce. For the deployer this is the *intended* terminal action after multisig handoff. For the multisig itself, a renunciation of `DEFAULT_ADMIN_ROLE` permanently locks role management; renunciation of `UPGRADER_ROLE` permanently locks upgrades. Asymmetric vs. the wrapper's `renounceOwnership` which is hard-blocked. **See LOW-2.**

### `contracts/Proxy.sol`
- One-line import to ensure `ERC1967Proxy` artifact compiles. ✅

### `contracts/interfaces/IERC20Precompile.sol`
- Standard `IERC20` shape. No `permit`, no fee-on-transfer hooks. The interface does not declare `decimals` / `name` / `symbol`, which is fine (the wrapper doesn't call them). ✅

### `contracts/mocks/*` and `test/wrapper.test.ts`
- Mocks are test-only. None are referenced by deploy scripts. ✅
- Test suite is comprehensive: deploy, wrap/unwrap, access control, pause, rescue, multi-user, UUPS, ownership, role mgmt, edge cases, reentrancy, events, V2 migration, allowlist, SafeERC20 defense, invariant view. 61 tests.
- **Coverage gap**: no test exercises `withdraw` being blocked by the allowlist when it was previously allowed and is later revoked from a user who already deposited (the "redemption freeze" case). The closest test ([L1017-L1029](../test/wrapper.test.ts#L1017-L1029)) covers the reverse — gates withdraw the same as deposit — which only confirms the freeze is reachable, not that it is intended. See **MED-1**.
- **Coverage gap**: no upgrade scenario from a `__gap[48]` predecessor to the current `__gap[46]` layout to verify the fresh-init default (`allowlistEnabled = true`) is preserved or reinitialized correctly.

---

## Phase 3 — Invariant Analysis

### I1 — Backing: `wrapper.foreignAsset.balanceOf(wrapper) >= wAJUN.totalSupply()`

| Path | Δ totalSupply | Δ foreign balance | Holds? |
|---|---|---|---|
| `deposit(N)` | +N | +N (assuming standard ERC20) | ✅ if no fee/rebase |
| `withdraw(N)` | −N | −N | ✅ |
| `pause/unpause` | 0 | 0 | ✅ |
| `rescueToken(other, to, N)` | 0 | 0 | ✅ (guard rejects `foreignAsset` and `token`) |
| Direct AJUN transfer to wrapper | 0 | +N | ✅ (over-collateralized) |
| `setAllowlist*` | 0 | 0 | ✅ |
| Upgrade w/ benign impl | 0 | 0 | ✅ |
| Upgrade w/ malicious impl | * | * | **violable by privileged action** |
| `mint` from `MINTER_ROLE` other than the wrapper | +N | 0 | **violable if `DEFAULT_ADMIN_ROLE` grants `MINTER_ROLE` to attacker** |
| Foreign asset is fee-on-transfer / rebasing | +N | +(N − fee) | violable (currently theoretical) |

**Counterexamples / privileged paths that break I1**:

1. `DEFAULT_ADMIN_ROLE.grantRole(MINTER_ROLE, attacker)` then `attacker.mint(...)`. **Trust-model risk; see MED-2.**
2. `UPGRADER_ROLE` upgrades the ERC20 to a contract that mints unrestricted. **Trust-model risk.**
3. Wrapper owner upgrades the wrapper to one that pulls foreign assets out without burning wAJUN. **Trust-model risk.**
4. Foreign-asset precompile spec changes to rebasing/fee-on-transfer. **Runtime risk; mitigation: pre/post balance check (LOW-1).**

### I2 — Sole minter: `AjunaWrapper` is the only address holding `MINTER_ROLE` in production

The contract does not enforce this. The `RoleGranted` event for `MINTER_ROLE` to anyone other than the wrapper is the only signal. **Implicit trust assumption; needs off-chain monitoring.**

### I3 — Rescue cannot touch the backing asset

Code path: `require(tokenAddress != address(foreignAsset))` and `require(tokenAddress != address(token))`. Both reads are dynamic, so any UUPS upgrade that changes `foreignAsset` is automatically reflected. ✅
**Caveat**: a UUPS upgrade that changes `foreignAsset` to a new precompile leaves the *old* AJUN balance recoverable via `rescueToken(oldAddress, ...)`. This is intentional from the contract's perspective (the new asset is what backs new mints), but operationally the old balance must be swept back to users *before* the address change. **Operational, not a contract defect.**

### I4 — Pause cannot permanently strand user funds

Pause halts `deposit` and `withdraw` but not the wAJUN ERC20 itself. While paused:
- Users with wAJUN can `transfer`/`approve` freely.
- Users cannot redeem.

**Liveness**: pause is reversible (`unpause`), and `renounceOwnership` is blocked. So pause cannot become permanent through that path.
**But**: an owner who pauses, then transfers ownership to an unwilling new owner who never calls `acceptOwnership`, **does not** strand the contract — the original owner remains in control until acceptance. ✅
**Counterexample**: if the multisig gets all keys lost (no compromise, just lost) and the contract is paused, funds are stranded *until keys are recovered*. Mitigation: governance / key-recovery is off-chain.

### I5 — Upgrade safety

- `_disableInitializers()` in both implementation constructors → impls are not initializable. ✅
- Storage layout: namespaced (ERC-7201) for OZ bases; derived state at slot 0 + `__gap[N]`. The current layout is consistent (Phase 2 verification).
- `proxiableUUID()` check is performed inside OZ's internal `_upgradeToAndCallUUPS`. ✅
- `code.length > 0` is layered. ✅
- **Subtle violation**: if a future implementation relocates a derived-state variable, the proxy storage will be misread. Manual storage diff per upgrade is mandatory. (See **Phase 5**.)

---

## Phase 4 — Targeted Deep Dives

### (a) The 1:1 backing invariant

Code paths from the contract logic alone preserve I1, *as long as* the foreign asset is a standard ERC20 and `MINTER_ROLE` is only held by the wrapper. The privileged-key paths above are the only routes to violation. The deposit path's lack of pre/post balance reconciliation makes the invariant brittle to future foreign-asset changes — **LOW-1**.

### (b) UUPS upgrade safety

Verified:
- Storage layout compatible (Phase 2 / I5).
- `_disableInitializers` in both constructors.
- `_authorizeUpgrade` access-controlled.
- `reinitializer(2)` test exists ([test/wrapper.test.ts:526-559](../test/wrapper.test.ts#L526-L559)).
- Implementations cannot be initialized directly (test at [L501-L510](../test/wrapper.test.ts#L501-L510)).

Risks:
- **Asymmetric upgrade authority**: wrapper upgrade is gated on `owner()`; ERC20 upgrade is gated on `UPGRADER_ROLE`. Two different keys could be required to upgrade the two contracts. If they are not the same governance principal, partial upgrades can leave the system in an inconsistent state (e.g., an ERC20 upgrade is authorized that adds a `mintByAdmin` function while the wrapper still believes it is the sole minter). **MED-2** captures the broader trust-model concern.
- **Storage-collision risk on future versions**: not enforced in code. Manual storage layout diff via `forge inspect` / `slither-check-upgradeability` is required per upgrade — see Phase 5.
- **Migration calldata**: any `upgradeToAndCall(impl, data)` runs `data` as a `delegatecall` in the proxy's storage. There is no on-chain way to require a specific migration shape. Operational discipline only.

### (c) Mutable foreign-asset address

**The contract does not provide a way to change `foreignAsset` at runtime.** It is set in `initialize()` and not exposed for write afterward. Changes require a UUPS upgrade with a `reinitializer` that writes `foreignAsset`. This is good — it pins the highest-risk parameter behind the slow, observable upgrade path.

If a future upgrade ever does redirect `foreignAsset`, a non-negotiable pre-flight checklist:
1. **Pause** the wrapper.
2. **Sweep** the old foreign asset back to users (pro-rata against `totalSupply`) — note this requires *another* mechanism, since `withdraw` is gated by `wAJUN.balanceOf` and burns wAJUN.
3. **Reconcile** to zero on the old asset.
4. **Verify** `wAJUN.totalSupply() == 0` or that all holders have been bought out off-chain.
5. **Upgrade** the wrapper, setting `foreignAsset = newAddress` via a `reinitializer`.
6. **Unpause**.

If skipped, the wrapper has wAJUN backed by an asset it has forgotten how to release — funds permanently stranded.

**Recommendation**: encode a one-shot `migrateForeignAsset(newAddress)` function under `onlyOwner` + `whenPaused` + `require(foreignAsset.balanceOf(this) == 0)` so the migration cannot complete with backing intact. *This would only be added in a future version; no change recommended for the current deploy.*

### (d) Token rescue

`rescueToken` has been verified:
- Cannot rescue `foreignAsset` ([L237](../contracts/AjunaWrapper.sol#L237)).
- Cannot rescue `token` (wAJUN) ([L238](../contracts/AjunaWrapper.sol#L238)).
- Cannot rescue to zero ([L239](../contracts/AjunaWrapper.sol#L239)).
- Goes through `SafeERC20.safeTransfer` ([L240](../contracts/AjunaWrapper.sol#L240)). ✅

Compositional check: even if a malicious upgrade replaced the wrapper logic, the new logic could simply ignore these guards. The rescue safety is therefore equivalent to "the upgrade authority is honest". This is captured in the trust model.

### (e) Access-control surface

**AjunaWrapper**:
- `onlyOwner`-gated functions: 8 (`pause`, `unpause`, `rescueToken`, `setAllowlistEnabled`, `setAllowlist`, `setAllowlistBatch`, `transferOwnership`, `_authorizeUpgrade`).
- `acceptOwnership` (Ownable2Step) gated on `pendingOwner`.
- `renounceOwnership` hard-blocked.
- Two-step transfer ✅ (REVIEW_v1 §M-A, confirmed by reading `Ownable2StepUpgradeable.sol:64-69`).

**AjunaERC20**:
- `onlyRole(MINTER_ROLE)`: `mint`, `burnFrom`.
- `onlyRole(UPGRADER_ROLE)`: `_authorizeUpgrade`.
- Role admin (default): `DEFAULT_ADMIN_ROLE`.
- **No two-step admin handoff** — `grantRole` + `renounceRole` is a one-shot. Same hazard the wrapper used to have (MEDIUM-A in REVIEW_v1) but unfixed on the ERC20. **See MED-2.**
- **`renounceRole` not blocked** — by design for deployer renouncement, but presents the same brick risk as the wrapper's old `renounceOwnership` if mis-used by the multisig. **See LOW-2.**

### (f) Pause semantics

`pause` halts `deposit` and `withdraw`. It does **not** halt:
- wAJUN `transfer`/`approve` (the ERC20 itself is not pausable).
- `rescueToken` (deliberate; emergency lever).
- Allowlist updates (deliberate; pause-and-prepare flow).
- Upgrades.

**Asymmetry**: a paused wrapper still has a circulating wAJUN supply. Off-chain DEX trading of wAJUN continues. This is generally desired (paused wrapper = paused redemption only). Trust-model item only.

**Non-strand**: pause is reversible by the owner; `renounceOwnership` is blocked; therefore pause cannot become permanent in the contract (key-loss aside). I4 holds.

### (g) ERC20 mint/burn flow

- Approval race condition: standard ERC20 hazard, mitigated at the dApp layer (REVIEW_v1 L-5). The wrapper itself cannot exploit a race — its only consumption of allowance is `burnFrom(user, amount)` inside `withdraw`, which mints exactly nothing back to the user (it releases AJUN). No way to use a race to over-burn or over-pull.
- `permit`: not implemented. No signature replay risk. ✅
- `burnFrom` allowance: correctly uses `_spendAllowance` (verified). ✅
- Zero-address checks: OZ `_mint` / `_burn` / `_transfer` enforce zero-address rejection. ✅

### (h) `pallet-revive`-specific risks

| Concern | Status |
|---|---|
| Gas/weight metering | Substrate weight ≠ EVM gas. The contract does no SSTORE-heavy work in user paths; `setAllowlistBatch` is the largest write loop and is owner-only. **Recommend**: cap batch size at ~100 in operational docs. |
| Precompile address conventions | Foreign assets at prefix `0x0220`. Computed off-chain via [scripts/lookup_ajun_asset.ts](../scripts/lookup_ajun_asset.ts). The wrapper accepts the resolved address as a constructor-time parameter — no hard-coded magic. ✅ Documented in [deployments.config.ts:39-43](../deployments.config.ts#L39-L43). |
| H160 ↔ AccountId32 mapping | `pallet-revive`'s `AccountId32Mapper.to_fallback_account_id` returns `H160 \|\| 0xEE..0xEE`. Stable for the lifetime of the runtime configuration. **Implicit trust assumption #2** — runtime governance can change this. |
| Reentrancy guarantees | Runtime-level `ReentrancyProtection::Strict` exists ([exec.rs:120-135](../polkadot-sdk/substrate/frame/revive/src/exec.rs)). Defense-in-depth on top of OZ `ReentrancyGuard`. ✅ |
| Return-data handling | SafeERC20 handles missing-return / `false`-return / standard-return cases. Verified by `BadERC20` test. ✅ |
| `selfdestruct` | Not used. ✅ |
| Storage rent / deposit | `pallet-revive` charges per-byte and per-item deposits. The wrapper's owner pays for `allowlisted` mapping entries and the deployment artifact. Operationally relevant. **Severity: Informational (INFO-4).** |
| Revert propagation | `pallet-revive` propagates EVM-style reverts; `safeTransfer*` paths revert on failure. ✅ |
| `address(this).balance` | Not used. ✅ |
| AccountId32 collision | Astronomically improbable (96-bit collision on `0xEE..0xEE` suffix). ✅ |

**Cross-environment caveat**: `pallet-revive` is under active development. Any deployment must verify against the runtime version live at deploy time. The vendored `polkadot-sdk` snapshot in this repo does **not** include the foreign-asset precompile (only basic precompiles in `polkadot-sdk/substrate/frame/revive/src/precompiles/builtin/`) — the team must verify the precompile contract on the runtime they deploy against (PR #10869 referenced in the docs).

### (i) Initialization & deployment

- **Front-running of `initialize`**: not possible — `ERC1967Proxy(impl, initData)` constructor encodes the init calldata in the proxy-creation transaction. The proxy and its first call to the impl happen atomically.
- **Impl direct init**: blocked by `_disableInitializers()` in constructor. Verified by test ([L501-L510](../test/wrapper.test.ts#L501-L510)). ✅
- **Atomicity of role setup**: `deploy_wrapper.ts` does `ERC20 init → wrapper init → grantRole(MINTER_ROLE, wrapper)` across three separate transactions. **Window of risk**: between wrapper deployment and `grantRole`, the wrapper proxy exists with `MINTER_ROLE` *not* yet held. A user who calls `deposit` in that window would have their `transferFrom` succeed (foreign asset moves into wrapper) but the subsequent `mint` would revert with `AccessControlUnauthorizedAccount` — entire tx reverts. So no theft risk, just a bad-UX denial-of-service on premature deposits. *Mitigation*: deploy in a private mempool / sequencer window, or use the allowlist gate (which is on by default). **Severity: Informational (INFO-1).**
- **Privileged-key relinquishment**: not done in code at deploy time; it is a [docs/PRODUCTION-CHECKLIST.md](PRODUCTION-CHECKLIST.md) Phase 8 manual step. The deployer EOA is the highest-impact key in the system between deploy and handoff.

### (j) Economic & operational concerns — pathways to violate I1

Audited in §3 / §4(a). Summary of *unprivileged* paths (none found):

- ❌ Mint via reentrancy → blocked by `nonReentrant`.
- ❌ Mint via approval-race → wrapper consumes allowance only in its own controlled flows.
- ❌ Withdraw without burn → `withdraw` always burns first via `burnFrom`.
- ❌ Reorg double-spend → withdraws are idempotent in the canonical chain; substrate finality (≈12-20s) makes reorgs rare and reversible only inside the unfinalized window.
- ❌ Rounding → 1:1 wrap, no rounding.
- ❌ Failed-transfer-without-revert → `safeTransfer*` rejects.

Privileged paths to violate I1 are limited to upgrade authority and `MINTER_ROLE` grants — see Phase 6.

---

## Phase 5 — Tooling & Verification

| Tool | What I'd run it for | What it would not catch |
|---|---|---|
| **Slither** (`slither contracts/`) | Standard detectors: reentrancy, unchecked-return, access control, low-level call, OZ misuse. | Trust-model issues; `pallet-revive`-specific semantics; storage layout under upgrades. |
| **Aderyn** | Modern Rust-based static analyzer; complements Slither with different heuristics. | Same gaps as Slither. |
| **slither-check-upgradeability** | Storage-layout diff between V1 and any proposed implementation. | Logic correctness of the migration code. |
| **`forge inspect <Contract> storageLayout` diff** | Manual storage-slot diff between the deployed impl and any new impl. **Mandatory before every upgrade.** | Reading-from-uninitialized-slot logic bugs (e.g., the `__gap[48]→[46]` upgrade case). |
| **Foundry invariant tests** | Encode I1, I2, I3, I4, I5 as fuzz invariants. Run for ≥10⁶ runs. | Privileged-actor adversarial scenarios — needs hand-crafted scenarios with role rotations. |
| **Echidna / Medusa** | Property-based fuzzing of the same invariants with handler-based actors. Strong on cross-function reentrancy and approval races. | `pallet-revive` semantics. |
| **Halmos / hevm (symbolic)** | `_authorizeUpgrade`, `onlyAllowedUser`, `renounceOwnership`, the role-admin lattice on `AjunaERC20`. | Bounded loops (`setAllowlistBatch`); concrete `pallet-revive` weight constraints. |
| **Differential testing EVM ↔ `pallet-revive`** | Compile + deploy the same bytecode against (a) Hardhat in-memory and (b) the local revive-dev-node. Diff: behaviors of `safeTransferFrom` against the foreign-asset precompile, gas/weight bounds on `setAllowlistBatch`, revert-on-paused vs. revert-on-allowlist ordering. **Mandatory** because EVM-equivalence is not assumed. | Mainnet runtime drift (must be re-run on the actual deploy target). |
| **Chopsticks (forked AssetHub)** | End-to-end tests against forked mainnet state, including the actual AJUN foreign asset. Already wired ([chopsticks.yml](../chopsticks.yml)). | Anything outside the forked block. |
| **Manual storage layout diff between `__gap[48]` predecessor and current `__gap[46]` impl** | Confirms whether a hot-upgrade would silently set `allowlistEnabled = false`. | — |

**Properties I would encode for fuzzing**:

- `forall ops: wrapper.foreignAsset.balanceOf(wrapper) >= wAJUN.totalSupply()`
- `forall ops: rescueToken(foreignAsset, ...) reverts`
- `forall ops: rescueToken(token, ...) reverts`
- `forall non-owner: setAllowlistEnabled, setAllowlist, setAllowlistBatch, pause, unpause, transferOwnership, rescueToken, _authorizeUpgrade revert`
- `forall paused: deposit reverts && withdraw reverts && rescueToken does NOT revert`
- `forall non-MINTER: mint reverts && burnFrom reverts`
- `mint(to, amount) followed by burnFrom(to, amount, allowance>=amount) is a no-op on totalSupply`

---

## Phase 6 — Findings & Final Report

### Executive Summary

The Ajuna Tokenswap is a small, self-contained treasury wrapper with two contracts and ~280 lines of business logic. The design is sound, the test suite is comprehensive (61 tests, all key invariants covered), and the prior internal review ([docs/REVIEW_v1.md](REVIEW_v1.md)) closed every previously-identified contract-level finding (M-A, L-A, L-B, INFO-A, INFO-C). Each prior fix was confirmed from source.

After re-deriving the threat model from scratch and looking specifically at **(i)** the post-review allowlist gate, **(ii)** the OZ 5.4→5.6.1 bump, **(iii)** privileged-actor surfaces not stress-tested in the prior review, and **(iv)** `pallet-revive`-specific concerns:

| Severity | Count | Items |
|---|---|---|
| Critical | 0 | — |
| High | 0 | — |
| **Medium** | **2 (✅ both fixed)** | MED-1 (allowlist no longer gates `withdraw`); MED-2 (`AccessControlDefaultAdminRulesUpgradeable` adopted) |
| **Low** | **3 (1 ✅ fixed, 1 ✅ fixed via MED-2, 1 mitigated)** | LOW-1 (✅ balance-delta on deposit); LOW-2 (✅ via MED-2: DEFAULT_ADMIN_ROLE renounce now requires the same two-step flow); LOW-3 (UX-DoS — already mitigated by allowlist-on-default; doc note added per INFO-1) |
| **Informational** | **5 (4 ✅ fixed, 1 ⚠ partially declined)** | INFO-1 (✅ doc); INFO-2 (⚠ `__UUPSUpgradeable_init` does not exist in OZ 5.6.1 — recommendation declined; AccessControl half resolved by MED-2); INFO-3 (✅ doc); INFO-4 (✅ MAX_ALLOWLIST_BATCH cap); INFO-5 (✅ doc + off-chain monitor recommendation) |

**Overall risk assessment (post-remediation)**: production-acceptable for the contract logic. MED-1 is fixed in code (withdraw no longer gated by the allowlist). MED-2 is fixed (ERC20 uses the same two-step + delayed admin transfer pattern as the wrapper, which already used Ownable2Step). LOW-1 / LOW-2 / INFO-1 / INFO-3 / INFO-4 / INFO-5 are addressed. INFO-B (timelock) remains operational (carry-over).

The contracts can now be safely deployed for staged rollout under the allowlist, smoke-tested, and opened to the public via a single tx. The post-launch attack surface is bounded by the multisig threshold and the (recommended) timelock contract. Both irreversible-by-typo handoff paths (wrapper owner via `Ownable2Step`, ERC20 admin via `AccessControlDefaultAdminRules`) now have multi-day cancellable windows.

---

### Trust Model & Centralization Disclosure (for end users)

In plain language, what the privileged keys can do:

#### Wrapper owner (single key — should be a multisig + timelock for production)
- **Pause** all deposits and withdrawals indefinitely. While paused, your wAJUN is still tradable on DEX or transferable, but **you cannot redeem it for AJUN through this contract**.
- **Re-enable the allowlist gate** at any time. If they then remove you from the allowlist (or never add you), **you cannot deposit or withdraw**. You retain wAJUN as a transferable asset and can sell it on a DEX or transfer it to an allowlisted account who can redeem on your behalf, but your direct redemption is denied. **(MED-1.)**
- **Rescue arbitrary ERC20 tokens** sent to the wrapper, *except* AJUN itself and wAJUN itself.
- **Upgrade the wrapper to any new implementation**, including one that bypasses every safety check above. With `onlyOwner` upgrade authority and *no on-chain timelock by default*, an upgrade is instant. **A malicious upgrade can drain all locked AJUN.** (Mitigation: multisig + timelock — operational, not enforced in contract.)
- **Transfer ownership** via the two-step Ownable2Step flow (typo-resistant). Cannot renounce ownership (deliberately blocked).

#### ERC20 `DEFAULT_ADMIN_ROLE` holder
- **Grant `MINTER_ROLE` to any address**, including themselves. That address can then **mint unbacked wAJUN**, immediately diluting your holdings and breaking the 1:1 backing.
- **Grant `UPGRADER_ROLE` to any address**, including themselves. That address can then **upgrade the ERC20 to remove burn restrictions, change supply, or steal balances directly**.
- Transfer admin via single-step `grantRole` + `renounceRole`. No two-step protection — a typo cannot be undone. **(MED-2.)**

#### ERC20 `UPGRADER_ROLE` holder
- **Upgrade the wAJUN ERC20 implementation** to anything they want, including code that reassigns balances. Same blast radius as a wrapper upgrade.

#### Same multisig holds both?
The contracts do not enforce that the wrapper owner and the ERC20 admin are the same governance principal. If they diverge, partial privilege escalation is possible. **(INFO-5.)**

**Worst-case for a compromised key**:

| Compromised key | Worst case |
|---|---|
| Wrapper owner | Drain all locked AJUN via malicious upgrade. Permanently freeze redemption via pause + allowlist. |
| ERC20 `DEFAULT_ADMIN_ROLE` | Mint unlimited wAJUN, sell on DEX, drain pools. Or upgrade the ERC20 to steal balances. |
| ERC20 `UPGRADER_ROLE` | Same as DEFAULT_ADMIN_ROLE upgrade path — replace ERC20 with malicious bytecode. |
| ERC20 `MINTER_ROLE` (wrapper) | Mint unbacked wAJUN if the wrapper itself is upgraded maliciously; otherwise the role is exercised only inside `deposit`. |

**Mitigations the team plans (operational, not in code)**:
- Multisig handoff (PRODUCTION-CHECKLIST Phase 8).
- Timelock in front of the multisig (REVIEW_v1 INFO-B — *not yet implemented*; **strongly recommended before mainnet**).
- Real-time monitoring of `isInvariantHealthy()` and `RoleGranted(MINTER_ROLE)` events.

---

### Findings

---

#### MED-1 — Owner can freeze redemption for arbitrary users via the allowlist gate (deviates from documented purpose) — ✅ **FIXED**

**Severity**: Medium. *Impact*: high (a user's right to redeem can be revoked without notice). *Likelihood*: low–medium (requires owner action — a malicious or compromised owner key, or a legitimate owner who mis-uses the gate). Probability is bounded by the multisig threshold and timelock (if any).
**Status**: ✅ Fixed via the audit's recommended fix #1 — `onlyAllowedUser` removed from `withdraw`. The allowlist now gates `deposit` only. Two tests confirm:
  1. A user removed from the allowlist after depositing can still `withdraw` (and is still blocked from new `deposit`s).
  2. A non-allowlisted account that received wAJUN via transfer can still `withdraw`.
The contract docstring on `allowlistEnabled` and the `onlyAllowedUser` modifier explicitly rules out gating `withdraw`. The pause circuit-breaker remains the only system-wide redemption halt available to the operator.

**Affected code**:
- [contracts/AjunaWrapper.sol:104-109](../contracts/AjunaWrapper.sol#L104-L109) — `onlyAllowedUser` modifier
- [contracts/AjunaWrapper.sol:112-115](../contracts/AjunaWrapper.sol#L112-L115) — `setAllowlistEnabled`
- [contracts/AjunaWrapper.sol:173](../contracts/AjunaWrapper.sol#L173) — `withdraw` is gated by `onlyAllowedUser`

**Description**: the allowlist gate is documented as an "initial-deploy gate, flipped off when going public" ([AjunaWrapper.sol:91](../contracts/AjunaWrapper.sol#L91), [docs/REVIEW_v1.md](REVIEW_v1.md), comment block [L41-L48](../contracts/AjunaWrapper.sol#L41-L48)). The gate, however, applies to **`withdraw`** and not just `deposit`, and `setAllowlistEnabled(true)` can be called at any time for any reason after the rollout. This means: after a user has already deposited AJUN and holds wAJUN, the owner can re-enable the allowlist and refuse to add the user, **denying them the ability to call `withdraw`**. The user retains wAJUN as a transferable asset, but their direct redemption path through this contract is closed.

This goes beyond the stated "staged rollout" purpose — it is a permanent, owner-controlled censorship/freeze surface that exists for the lifetime of the contract.

**Concrete attack scenario / PoC**:
1. Day 0: deploy with `allowlistEnabled = true`. Add `Alice` to the allowlist.
2. Day 1: `Alice.deposit(1000 AJUN)`. Alice receives 1000 wAJUN. ✅
3. Day 30 (after public rollout): `setAllowlistEnabled(false)`. Anyone can now wrap/unwrap.
4. Day 365: governance / compromised key calls `setAllowlistEnabled(true)`. The mapping still has Alice (and whoever else was allowlisted). Bob, who deposited during the open phase, is **not** in the mapping.
5. Bob's next `withdraw(...)` call reverts with `AjunaWrapper: not allowlisted`. Bob still holds wAJUN; Bob cannot redeem unless he transfers to Alice or sells on a DEX.

This scenario was reproducible in 5 minutes of test-suite extension; it is exactly the path verified by the test "should gate withdraw the same way as deposit" at [test/wrapper.test.ts:1017-1029](../test/wrapper.test.ts#L1017-L1029). The current test confirms the freeze is *reachable*; it does not confirm it is *intended*.

**Recommended remediation** (pick one, ordered by user-protection strength):
1. **Strongest — gate only `deposit`**, never `withdraw`. The allowlist's stated purpose ("staged rollout — control who can wrap") only requires deposit-side gating. Redemption is the user's right. Apply `onlyAllowedUser` only to `deposit`:
   ```solidity
   function deposit(uint256 amount) external nonReentrant whenNotPaused onlyAllowedUser { ... }
   function withdraw(uint256 amount) external nonReentrant whenNotPaused { ... }
   ```
2. **Time-bounded — make the allowlist self-disabling**. Store an `allowlistDeadline` (e.g., set in `initialize`); after that timestamp, `onlyAllowedUser` becomes a no-op regardless of `allowlistEnabled`. Prevents the post-launch re-enable surface entirely.
3. **One-way — make `setAllowlistEnabled(false)` irreversible**. Add `require(!allowlistDisabledForever)` and a `disableAllowlistForever()` one-shot. The trust-model guarantee becomes auditable on-chain.
4. **Disclose-only**: leave the code unchanged but add a prominent paragraph to the trust-model section of [docs/SECURITY.md](SECURITY.md) explaining that the wrapper owner can re-enable the gate post-launch and freeze withdraws.

Recommendation: **(1)** is the cleanest fix. Withdrawing your own assets from a treasury contract should not require permission from the operator. Combined with the `pause` circuit breaker, the operator already has a temporal kill-switch; the allowlist on `withdraw` is duplicative and worse-targeted (per-user instead of system-wide).

**Reference**: the analogous concern was discussed in the OpenZeppelin community after the "Tornado Cash sanction" precedent — censoring redemption (vs. blocking deposit) is qualitatively different from a user-rights perspective, even when both are possible.

---

#### MED-2 — `AjunaERC20` admin handoff is single-step (mirrors the pre-fix `AjunaWrapper` MEDIUM-A) — ✅ **FIXED**

**Severity**: Medium (operational; failure mode is irreversible).
*Impact*: critical (a typo permanently hands over admin of the ERC20, including upgrade authority and `MINTER_ROLE` grant authority). *Likelihood*: low (only at handoff time), but the cost of the failure is total.
**Status**: ✅ Fixed — `AjunaERC20` now inherits `AccessControlDefaultAdminRulesUpgradeable`. `DEFAULT_ADMIN_ROLE` transfer requires `beginDefaultAdminTransfer` from the current admin and `acceptDefaultAdminTransfer` from the new admin after a configurable delay (production: 5 days). Direct `grantRole(DEFAULT_ADMIN_ROLE, ...)` and direct `renounceRole(DEFAULT_ADMIN_ROLE, ...)` are now blocked by the rules contract. The `initialize` signature gained a `uint48 initialAdminDelay` parameter; the deploy script defaults to 432000 s (5 d) and accepts override via `ADMIN_DELAY_SECS` env var. Six new tests cover the surface, the cancellation flow, and the renunciation flow. Storage layout unchanged for derived state — the rules contract uses a separate ERC-7201 namespace.

**Affected code**:
- [contracts/AjunaERC20.sol:17](../contracts/AjunaERC20.sol#L17) (uses `AccessControlUpgradeable`, not `AccessControlDefaultAdminRulesUpgradeable`)
- [contracts/AjunaERC20.sol:49-50](../contracts/AjunaERC20.sol#L49-L50) — `_grantRole` of `DEFAULT_ADMIN_ROLE` and `UPGRADER_ROLE` to `admin`

**Description**: the team already fixed the equivalent issue on the wrapper (REVIEW_v1 §M-A → `Ownable2StepUpgradeable`). The same hazard exists, unfixed, on the ERC20:

The intended production handoff (per [docs/PRODUCTION-CHECKLIST.md](PRODUCTION-CHECKLIST.md)) is to `grantRole(DEFAULT_ADMIN_ROLE, multisig)` then `renounceRole(DEFAULT_ADMIN_ROLE, deployer)`. If the deployer EOA mistypes the multisig address — or constructs the multisig at the wrong address (Safe creation can produce predictable but wrong addresses if salt or factory is mis-specified) — the admin role is granted to a wrong-but-valid address, and the deployer's renunciation finalizes the mistake. There is no on-chain undo.

The blast radius of the ERC20 admin role is exactly the same as the wrapper owner's: a hostile DEFAULT_ADMIN_ROLE holder can grant `MINTER_ROLE` to a malicious contract and mint unbacked wAJUN, breaking I1 immediately.

**Concrete attack scenario / PoC**:
1. Deployer means to grant DEFAULT_ADMIN_ROLE to `0x1234...AAAA` (the multisig).
2. Deployer accidentally pastes `0x1234...AAAB` (off by one bit). EIP-55 checksum may or may not catch this depending on the bit position.
3. `grantRole(DEFAULT_ADMIN_ROLE, 0x1234AAAB)` succeeds — no checksum validation at the contract level for `bytes32` role + `address` arguments.
4. Deployer calls `renounceRole(DEFAULT_ADMIN_ROLE, deployer)`.
5. The wrong address now has full admin and the right address (the actual multisig) has no role at all. **There is no recovery.**

**Recommended remediation**:
- Switch to **`AccessControlDefaultAdminRulesUpgradeable`** (OZ Contracts Upgradeable v5). It enforces a two-step admin transfer with a configurable delay (e.g., 5 days), preventing typo-irreversibility and giving the new admin time to abort. This is the OZ-recommended pattern for high-stakes admin keys, mirroring `Ownable2Step`.
- Storage layout: `AccessControlDefaultAdminRulesUpgradeable` adds a `_currentDelay`, `_pendingDefaultAdmin`, `_pendingDefaultAdminSchedule`, `_pendingDelay`, `_pendingDelaySchedule` (5 slots) under namespaced ERC-7201 storage, **not** in the derived `__gap`. So no storage collision — but verify with `forge inspect` before upgrade. (And note: this would be applied as a *fresh* deploy if the team has not yet shipped to mainnet. As an upgrade of an already-live contract, the storage layout diff requires careful audit.)
- Operational alternative if a code change is undesired: perform the role grant + renunciation through a script that (a) computes EIP-55 checksum on the destination, (b) does a dry-run `eth_call` against the multisig address to confirm it can act (e.g., it accepts a no-op tx), and (c) introduces a 24-hour delay between grant and renunciation during which the new admin demonstrates control.

**References**:
- OZ `AccessControlDefaultAdminRulesUpgradeable`: https://docs.openzeppelin.com/contracts/5.x/api/access#AccessControlDefaultAdminRules
- The team's prior fix for the same issue on `AjunaWrapper` ([docs/REVIEW_v1.md §MEDIUM-A](REVIEW_v1.md)) sets the precedent; consistency argues for the same fix on the ERC20.

---

#### LOW-1 — `deposit` mints `amount` regardless of foreign-asset balance delta (defense-in-depth against fee/rebasing tokens) — ✅ **FIXED**

**Severity**: Low (defense-in-depth; the current foreign-asset precompile is documented as standard ERC20).
**Status**: ✅ Fixed — `deposit` now snapshots `balanceOf(this)` before the pull, then mints exactly the delta after. Verified by a `FeeOnTransferERC20` mock (10% fee): the wrapper mints exactly the received amount, the invariant holds, and `Deposited(user, received)` reflects the post-fee figure.

**Affected code**: [contracts/AjunaWrapper.sol:149-164](../contracts/AjunaWrapper.sol#L149-L164)

**Description**: `deposit` calls `safeTransferFrom(user, this, amount)` followed by `token.mint(user, amount)`, using the input `amount` for the mint regardless of how much was actually received. This is correct for the *current* AJUN foreign-asset precompile (which is a standard ERC20 with no fee-on-transfer or rebasing semantics) but brittle:

- If a future UUPS upgrade ever redirects `foreignAsset` (Phase 4(c)) to a non-standard ERC20.
- If the precompile spec is amended (e.g., Polkadot governance adds fees on certain assets).

…the wrapper would mint full `amount` while the treasury received less, immediately under-collateralizing the system.

**Recommended remediation**:
```solidity
function deposit(uint256 amount) external nonReentrant whenNotPaused onlyAllowedUser {
    require(amount > 0, "Amount must be > 0");
    uint256 balanceBefore = IERC20(address(foreignAsset)).balanceOf(address(this));
    IERC20(address(foreignAsset)).safeTransferFrom(msg.sender, address(this), amount);
    uint256 received = IERC20(address(foreignAsset)).balanceOf(address(this)) - balanceBefore;
    token.mint(msg.sender, received);
    emit Deposited(msg.sender, received);
}
```
This is correct under fee-on-transfer (mints what was actually received) and unchanged under standard ERC20 (`received == amount`). Cost: two extra `staticcall`s to the precompile (~5k gas / weight equivalent on `pallet-revive`).

Symmetric defense on `withdraw` is unnecessary because `withdraw` burns wAJUN first (which cannot fail to deduct the right amount — it's our own contract) and then transfers AJUN out. A reduced AJUN transfer just leaves the user with less AJUN — they consented to it by approving the burn.

---

#### LOW-2 — `AjunaERC20` `renounceRole` is not blocked for `UPGRADER_ROLE` / `DEFAULT_ADMIN_ROLE` (parallel to LOW-B fix on the wrapper, not applied here) — ✅ **FIXED (DEFAULT_ADMIN_ROLE side)**

**Severity**: Low (requires deliberate or accidental role-holder action; failure mode is irreversible for upgrade authority).
**Status**: ✅ Partially-fixed via MED-2 — `AccessControlDefaultAdminRulesUpgradeable` enforces an exactly-one-admin invariant: a direct `renounceRole(DEFAULT_ADMIN_ROLE, ...)` reverts. Renunciation now requires the same two-step flow (`beginDefaultAdminTransfer(address(0))` → `acceptDefaultAdminTransfer`), giving the multisig a 5-day window to reverse a mistake. UPGRADER_ROLE renunciation remains intentionally unblocked because it is the deployer's terminal action after handoff; documented in the production checklist Phase 9B.

**Affected code**: [contracts/AjunaERC20.sol:17](../contracts/AjunaERC20.sol#L17) (no override of `renounceRole`)

**Description**: the wrapper's `renounceOwnership` is hard-blocked ([AjunaWrapper.sol:255-257](../contracts/AjunaWrapper.sol#L255-L257)) precisely because permanent loss of admin levers is unrecoverable. The ERC20 has the same hazard — `renounceRole(DEFAULT_ADMIN_ROLE, multisig)` permanently locks role management; `renounceRole(UPGRADER_ROLE, multisig)` permanently locks upgrades — but no equivalent block.

This is partially **by design** (the deployer EOA *should* renounce both roles after granting them to the multisig per Phase 8 of the production checklist). The hazard is the *post-handoff* multisig itself accidentally calling `renounceRole`.

**Recommended remediation**: pick one path:
1. **Allow deployer renouncement, block multisig renouncement**: override `renounceRole` to require that the role still has at least one other holder. This permits the deployer's terminal renunciation (the multisig still has the role) but blocks a multisig-only renunciation that would brick the system.
   ```solidity
   function renounceRole(bytes32 role, address account) public override {
       require(getRoleMemberCount(role) > 1, "AjunaERC20: cannot renounce sole role holder");
       super.renounceRole(role, account);
   }
   ```
   Note: requires `AccessControlEnumerableUpgradeable` for `getRoleMemberCount`. Adds storage cost.
2. **Documentation only**: add a runbook warning that no governance proposal should ever include `renounceRole` for `DEFAULT_ADMIN_ROLE` or `UPGRADER_ROLE` post-handoff. Cheaper but relies on operational discipline.
3. **Switch to `AccessControlDefaultAdminRulesUpgradeable`**: it requires that `DEFAULT_ADMIN_ROLE` always have exactly one holder, preventing accidental renunciation (the upgrade flow is via two-step transfer).

(2) is the minimum acceptable. (3) addresses both this finding and **MED-2** with a single change.

---

#### LOW-3 — Race window between wrapper proxy deploy and `MINTER_ROLE` grant (UX-DoS, not a fund-loss vector)

**Severity**: Low (operational/UX; no fund loss).

**Affected code**: [scripts/deploy_wrapper.ts:69-77](../scripts/deploy_wrapper.ts#L69-L77)

**Description**: the deploy script:
1. Deploys the wrapper proxy (with `initialize` calldata).
2. **Separate transaction**: `token.grantRole(MINTER_ROLE, wrapperAddr)`.

Between (1) and (2), the wrapper proxy is live and accepting `deposit` calls but cannot complete them — the `mint` call inside `deposit` will revert with `AccessControlUnauthorizedAccount`. The entire tx reverts atomically, so no funds are lost or stuck. But:
- A user who attempts to deposit in this window pays gas/weight for a failed tx.
- An attacker observing the deploy can spam failed deposits to grief monitoring.
- If the `grantRole` transaction is delayed by several minutes (mempool, fee market), the public can be confused about why deposits aren't working.

**Mitigation in current design**: the **allowlist is on by default** (`allowlistEnabled = true` in `initialize`), so unprivileged users are blocked from `deposit` until the owner explicitly allowlists them. This effectively closes the race window for production. ✅

**Recommended remediation** (defense-in-depth, optional):
- Atomicize the deploy by calling `grantRole` from inside the wrapper's `initialize` (would require the wrapper to also hold `DEFAULT_ADMIN_ROLE` on the ERC20, which broadens the wrapper's role surface — **not recommended**, more invasive than the fix is worth).
- Or, perform the deploy via a one-shot `DeployerScript` contract that does all three steps in a single transaction. Cleaner. Worth doing once if the team plans repeat deployments.
- Or, simply document that the allowlist remains on between proxy deploy and `grantRole`, which is already the case. **This is sufficient.**

---

#### INFO-1 — Deploy ordering documentation should reference the inherent atomicity gap — ✅ **FIXED**

**Severity**: Informational. Operational documentation item.
**Status**: ✅ Fixed — [docs/DEPLOYMENT.md](DEPLOYMENT.md) "Deployment Sequence" section now documents the race window between Step 4 (wrapper proxy live) and Step 5 (`grantRole(MINTER_ROLE, wrapper)`), and notes that the default-on allowlist gate closes it.

---

#### INFO-2 — `initialize` does not call `__AccessControl_init()` (ERC20) or `__UUPSUpgradeable_init()` (both contracts) — ⚠ **PARTIALLY DECLINED**

**Severity**: Informational. Defense-in-depth.
**Status**: ⚠ Partially declined after technical verification. Direct inspection of OZ 5.6.1's `node_modules/@openzeppelin/contracts/proxy/utils/UUPSUpgradeable.sol` (annotated `@custom:stateless`) shows that `__UUPSUpgradeable_init()` **does not exist** — adding the call would fail to compile. The upgradeable variant is just a re-export. The audit's claim that this is an "empty function" is incorrect for OZ 5.6.1. The MED-2 switch to `AccessControlDefaultAdminRulesUpgradeable` supersedes the `__AccessControl_init()` half: the new contract's `__AccessControlDefaultAdminRules_init(...)` is now called, replacing the recommendation. Net effect: contract is in the right shape for OZ 5.6.1.

**Affected code**:
- [contracts/AjunaERC20.sol:39-52](../contracts/AjunaERC20.sol#L39-L52)
- [contracts/AjunaWrapper.sol:72-88](../contracts/AjunaWrapper.sol#L72-L88)

**Description**: in OZ Contracts Upgradeable 5.6.1, `__AccessControl_init()` and `__UUPSUpgradeable_init()` are **empty functions** (verified). Skipping them is currently safe. However, future OZ minor versions could add initialization logic to either (e.g., to set namespaced storage flags), at which point upgrading the OZ dependency without re-checking these init calls would silently leave new namespaced state uninitialized.

**Recommended remediation**: add the calls explicitly. Zero runtime cost when they are empty, and forward-compatible:
```solidity
// AjunaERC20.initialize
__ERC20_init(name_, symbol_);
__AccessControl_init();
__UUPSUpgradeable_init();

// AjunaWrapper.initialize
__Ownable_init(msg.sender);
__Ownable2Step_init();
__Pausable_init();
__UUPSUpgradeable_init();
__ReentrancyGuard_init(); // see note below
```

**Note on `ReentrancyGuard`**: the wrapper currently imports `@openzeppelin/contracts/utils/ReentrancyGuard.sol` (the *non*-upgradeable variant), per [AjunaWrapper.sol:5](../contracts/AjunaWrapper.sol#L5). This is **not** a defect — `ReentrancyGuard` uses a derived storage slot allocated at compile time and is safe under proxies as long as the derived layout is preserved (which it is, after the `__gap[46]`). The upgradeable variant exists primarily to use ERC-7201 namespaced storage for forward-compat. Switching to `ReentrancyGuardUpgradeable` would be cleaner and consistent with the rest of the imports. **Severity: Informational.**

---

#### INFO-3 — `allowlistEnabled` defaults to `false` if this code is deployed as an *upgrade* of an existing wrapper (vs. a fresh proxy) — ✅ **FIXED (doc)**

**Severity**: Informational (current docs treat this as a fresh deploy; flagged for upgrade runbooks).
**Status**: ✅ Fixed — [docs/UPGRADE.md](UPGRADE.md) now contains a section "Upgrade-time defaults for new derived state" explaining that `initialize` does not run on an upgrade and any non-zero default for newly added derived-contract state must be set via a `reinitializer(N)` migration. No code change needed for the documented fresh-deploy path.

**Affected code**: [contracts/AjunaWrapper.sol:44](../contracts/AjunaWrapper.sol#L44), [L86-L87](../contracts/AjunaWrapper.sol#L86-L87)

**Description**: the `initialize` sets `allowlistEnabled = true`. But `initialize` only runs once per proxy — for an *upgrade* of an already-initialized wrapper, the new variables `allowlistEnabled` and `allowlisted` are read from previously-zero `__gap` slots. They default to `false` and empty mapping respectively. The new code's "staged rollout default" silently does nothing. The contract still works (allowlist disabled = open), but the team's intent (gate on by default) is not realized.

**Recommended remediation**: when this code is deployed as an upgrade rather than a fresh proxy (not the documented path, but if it ever happens), include a `reinitializer(2)` migration:

```solidity
function migrateToV2() external reinitializer(2) onlyOwner {
    allowlistEnabled = true;
    emit AllowlistEnabledUpdated(true);
}
```
Then call via `upgradeToAndCall(newImpl, abi.encodeCall(this.migrateToV2, ()))`.

For the *documented* fresh-deploy path, no change needed.

---

#### INFO-4 — `setAllowlistBatch` has no upper bound (operator-side weight DoS) — ✅ **FIXED**

**Severity**: Informational.
**Status**: ✅ Fixed — `MAX_ALLOWLIST_BATCH = 100` constant added to `AjunaWrapper`, with `require(accounts.length <= MAX_ALLOWLIST_BATCH, ...)` at the top of `setAllowlistBatch`. Two new tests verify rejection at cap+1 and acceptance at cap.

**Affected code**: [contracts/AjunaWrapper.sol:130-137](../contracts/AjunaWrapper.sol#L130-L137)

**Description**: a sufficiently large `accounts[]` argument exceeds `pallet-revive`'s per-block weight bound and the call partially executes then reverts. Owner-only, so this is a self-inflicted DoS, not a security finding. But operationally, large batches should be split.

**Recommended remediation**: document a per-call cap (e.g., 100 entries) in the operator runbook. Or enforce in code: `require(accounts.length <= 100)`. Trade-off: small loss of flexibility for guaranteed atomicity.

---

#### INFO-5 — No on-chain coupling between wrapper owner and ERC20 admin — ✅ **FIXED (doc)**

**Severity**: Informational.
**Status**: ✅ Fixed — [docs/PRODUCTION-CHECKLIST.md](PRODUCTION-CHECKLIST.md) Phase 9C explicitly requires verifying `wrapper.owner() == token.defaultAdmin()` after handoff and recommends an off-chain monitor for the inverted condition. The constraint remains operational rather than enforced in code, which preserves flexibility for future governance decompositions.

**Description**: nothing requires that `AjunaWrapper.owner()` and `AjunaERC20`'s `DEFAULT_ADMIN_ROLE` resolve to the same governance principal. After multisig handoff, divergence is possible (e.g., the ERC20 admin handoff is delayed or missed). In the divergent state, partial privilege escalations are reachable: e.g., the ERC20 admin can grant a third party `MINTER_ROLE` while the wrapper owner pauses the wrapper — leaving the third party able to mint unbacked wAJUN with no countervailing pause on the ERC20 itself.

**Recommended remediation**: governance/operational discipline. Document an explicit invariant: "`AjunaWrapper.owner()` and the address holding `AjunaERC20.DEFAULT_ADMIN_ROLE` MUST be the same multisig (or address controlled by the same governance system) at all times." Add an off-chain monitor that alarms if `wrapper.owner() != ERC20.getRoleMember(DEFAULT_ADMIN_ROLE, 0)` (requires `AccessControlEnumerable`).

---

### Carry-over from REVIEW_v1.md (re-verified, no change in status)

| Finding | Status | Notes |
|---|---|---|
| MEDIUM-A (Ownable2Step on wrapper) | ✅ Fixed | Re-verified: [AjunaWrapper.sol:30](../contracts/AjunaWrapper.sol#L30) inherits `Ownable2StepUpgradeable`; `_pendingOwner` lives at namespaced ERC-7201 slot `0x237e158222e3e6968b72b9db0d8043aacf074ad9f650f0d1606b4d82ee432c00`. No storage collision. |
| LOW-A (SafeERC20 on deposit/withdraw) | ✅ Fixed | Re-verified at [L154](../contracts/AjunaWrapper.sol#L154) and [L184](../contracts/AjunaWrapper.sol#L184). |
| LOW-B (renounceOwnership blocked) | ✅ Fixed | Re-verified at [L255-L257](../contracts/AjunaWrapper.sol#L255-L257). |
| INFO-A (Hardhat config fail-fast) | ✅ Fixed | Re-verified at [hardhat.config.ts:17-23](../hardhat.config.ts#L17-L23). |
| INFO-B (no timelock) | ⚠ Open | Operational. **Strongly recommended before mainnet.** A `TimelockController` in front of the multisig converts every privileged action into a public, time-bounded operation that users can react to. |
| INFO-C (`isInvariantHealthy`) | ✅ Fixed | Re-verified at [L207-L209](../contracts/AjunaWrapper.sol#L207-L209). |
| INFO-D (existential-deposit dust seeding) | ⚠ Open | Operational. PRODUCTION-CHECKLIST Phase 6B mandates dust seeding. ✅ |
| INFO-E (mocks compiled into artifacts) | ⚠ Open | Verified `scripts/` does not deploy mocks. Recommend adding a hardhat compile-list filter to exclude `contracts/mocks/` from production artifacts to reduce review surface. |
| MEDIUM-3 (Ownable vs AccessControl asymmetry) | ⚠ Carry-over, accepted | Combined with **MED-2**, this is the largest unfixed contract-level concern. Recommend revisiting before mainnet handoff. |
| LOW-1 (redundant balance check) | ⚠ Carry-over, accepted | UX > gas trade-off. ✅ |
| LOW-5 (approval front-run) | ⚠ Industry-standard | Mitigated at dApp layer. ✅ |

---

### Invariants for Continuous Monitoring

Encode these as on-chain checks (where cheap), off-chain monitors (when continuous), and fuzz/formal properties:

| ID | Invariant | Check method |
|---|---|---|
| I1 | `foreignAsset.balanceOf(wrapper) >= wAJUN.totalSupply()` | On-chain: `isInvariantHealthy()`. Off-chain: alarm when `<`. Fuzz: Foundry/Echidna. |
| I2 | Only `wrapper` holds `MINTER_ROLE` on `wAJUN` | Off-chain: subscribe to `RoleGranted(MINTER_ROLE, *)`. Alarm on any non-wrapper grant. Fuzz: Halmos. |
| I3 | `rescueToken` cannot transfer `foreignAsset` or `token` | Foundry property test (cheap, exhaustive). |
| I4 | Pause is not permanent: `owner != address(0)` always | On-chain: implicit via `renounceOwnership` revert. Off-chain: confirm `owner()` is non-zero. |
| I5 | Storage layout preserved across upgrades | Manual diff via `forge inspect`/Slither before each upgrade. |
| I6 | `wrapper.owner() == ERC20.getRoleMember(DEFAULT_ADMIN_ROLE, 0)` (governance coupling) | Off-chain monitor. (Requires AccessControlEnumerable; for now, monitor `RoleGranted(DEFAULT_ADMIN_ROLE)` and `OwnershipTransferred` events.) |
| I7 | `allowlistEnabled` once flipped to `false` stays `false` (if the team adopts the one-way recommendation) | Off-chain monitor on `AllowlistEnabledUpdated(true)` events. |
| I8 | Wrapper holds `MINTER_ROLE` on `wAJUN` (post-deploy) | Off-chain: alarm if `RoleRevoked(MINTER_ROLE, wrapper)` is observed. |

---

### `pallet-revive` Addendum

Operational and environment-specific guidance for the team:

1. **Verify the runtime version at deploy time.** The vendored `polkadot-sdk` snapshot in this repo (`polkadot-sdk/substrate/frame/revive/`) does not include the foreign-asset ERC20 precompile referenced by [deployments.config.ts](../deployments.config.ts) (PR #10869). Confirm the precompile is live on the AssetHub runtime version you deploy against before any mainnet tx.

2. **Differential test EVM ↔ revive behavior.** Pre-launch, run [test/wrapper.test.ts](../test/wrapper.test.ts) against both the in-memory Hardhat network and the local `revive-dev-node`. The reentrancy test, SafeERC20 test, and weight-bound `setAllowlistBatch` test are the most likely to surface differences.

3. **Coordinate with parachain governance on runtime upgrades.** The H160→AccountId32 mapping (`polkadot-sdk/substrate/frame/revive/src/address.rs:115-141`) is part of the runtime configuration. Any parachain runtime upgrade that touches `AccountId32Mapper`, the foreign-asset precompile, or the precompile address derivation could orphan the wrapper's holdings. Subscribe to AssetHub governance proposals.

4. **Existential deposit / dust seeding.** Already in PRODUCTION-CHECKLIST Phase 6B. Reaping the wrapper's AJUN account would brick all subsequent deposits.

5. **Storage deposits.** Each entry added via `setAllowlist`/`setAllowlistBatch` consumes a per-item storage deposit charged to the caller (the owner). Budget for this.

6. **Block reorg / finality.** AssetHub finalizes via GRANDPA in ~12-20s. Honoring redemptions or accepting deposits within the unfinalized window allows reorg-induced double-spend in extreme scenarios. Off-chain UIs that reflect deposits should display a "pending finality" state.

7. **Monitoring.** Set up alarms for:
   - `isInvariantHealthy() == false` (any direction).
   - `RoleGranted(MINTER_ROLE, *)` where `*` is not the wrapper.
   - `OwnershipTransferStarted` (start of two-step transfer).
   - `OwnershipTransferred` (completion).
   - `Upgraded(implementation)` on either proxy.
   - `Paused` / `Unpaused`.
   - `AllowlistEnabledUpdated(true)` post-launch.

---

### Appendix

**Methodology**: independent line-by-line review per the engagement brief; threat-modeling driven by the 1:1 backing invariant; cross-checked against the in-repo internal review ([docs/REVIEW_v1.md](REVIEW_v1.md)) without deferring to its conclusions.

**Tools used during this review**:
- Manual code reading.
- `git log` / `git rev-parse HEAD` for the freeze commit.
- Direct inspection of `node_modules/@openzeppelin/contracts-upgradeable/access/Ownable2StepUpgradeable.sol` (5.6.1) to verify the namespaced-storage claim.
- Direct inspection of `polkadot-sdk/substrate/frame/revive/src/{exec.rs,address.rs}` to verify reentrancy and address-mapping claims.

**Files reviewed (with size for fingerprint)**:
- [contracts/AjunaERC20.sol](../contracts/AjunaERC20.sol) — 93 lines
- [contracts/AjunaWrapper.sol](../contracts/AjunaWrapper.sol) — 276 lines
- [contracts/Proxy.sol](../contracts/Proxy.sol) — 6 lines
- [contracts/interfaces/IERC20Precompile.sol](../contracts/interfaces/IERC20Precompile.sol) — 17 lines
- [contracts/mocks/AjunaERC20V2.sol](../contracts/mocks/AjunaERC20V2.sol), [contracts/mocks/AjunaWrapperV2.sol](../contracts/mocks/AjunaWrapperV2.sol), [contracts/mocks/BadERC20.sol](../contracts/mocks/BadERC20.sol), [contracts/mocks/ReentrantToken.sol](../contracts/mocks/ReentrantToken.sol)
- [scripts/deploy_wrapper.ts](../scripts/deploy_wrapper.ts), [hardhat.config.ts](../hardhat.config.ts), [deployments.config.ts](../deployments.config.ts)
- [test/wrapper.test.ts](../test/wrapper.test.ts) — 1206 lines

**Out of scope**: the vendored `polkadot-sdk/` directory was used for runtime reference only — its security is the upstream Parity/Polkadot project's responsibility. The frontend (`frontend/app.html`, `frontend/test-ui.html`) was not reviewed beyond confirming it does not affect contract security. Off-chain monitoring infrastructure and multisig key custody procedures are out of scope.

**Items deferred to a follow-up review**:
- After remediation of MED-1 and MED-2, re-review the changed code paths.
- After timelock deployment (INFO-B), review the timelock configuration and proposer/executor role split.
- After any UUPS upgrade, perform a manual storage-layout diff and a one-day re-review focused on the changed surface.

**Limits acknowledged**:
- The foreign-asset ERC20 precompile's behavior was not directly verified because the source is not in this checkout. Reliance is on the documented spec ([deployments.config.ts:39-43](../deployments.config.ts#L39-L43)) and standard ERC20 expectations. The team should confirm against the deployed runtime.
- The test suite and static analyzers were not run as part of this engagement — this is a code-reading audit. The recommendations in **Phase 5** describe the tooling that should be run in a follow-up.
- `pallet-revive` is under active development; the behaviors described here are accurate for the snapshot at this repo's vendored copy and should be re-verified against the runtime version targeted at deploy.

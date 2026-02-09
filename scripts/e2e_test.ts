/**
 * End-to-End integration test for the Ajuna Token Swap.
 *
 * Unlike the unit tests (which run in Hardhat's in-memory EVM), this script
 * executes against a LIVE network — local dev node, testnet, or Chopsticks fork.
 * It performs the full user journey:
 *
 *   1. Check pre-conditions (balances, contract state)
 *   2. Approve → Deposit (wrap AJUN → wAJUN)
 *   3. Verify balances and invariant
 *   4. Approve → Withdraw (unwrap wAJUN → AJUN)
 *   5. Verify balances restored and invariant holds
 *
 * Environment variables:
 *   WRAPPER_ADDRESS   — AjunaWrapper treasury address
 *   ERC20_ADDRESS     — AjunaERC20 (wAJUN) address
 *   FOREIGN_ASSET     — Foreign asset address (precompile or mock ERC20)
 *   AMOUNT            — Amount to wrap/unwrap in human-readable units (default: "100")
 *
 * Usage:
 *   # Local dev node (after deploying mock + contracts):
 *   WRAPPER_ADDRESS=0x... ERC20_ADDRESS=0x... FOREIGN_ASSET=0x... \
 *     npx hardhat run scripts/e2e_test.ts --network local
 *
 *   # Testnet:
 *   WRAPPER_ADDRESS=0x... ERC20_ADDRESS=0x... FOREIGN_ASSET=0x... \
 *     npx hardhat run scripts/e2e_test.ts --network polkadotTestnet
 */

import { ethers } from "hardhat";

// ─── ABI fragments ──────────────────────────────────────────────────────────
const ERC20_ABI = [
  "function balanceOf(address) view returns (uint256)",
  "function allowance(address, address) view returns (uint256)",
  "function approve(address, uint256) returns (bool)",
  "function decimals() view returns (uint8)",
  "function totalSupply() view returns (uint256)",
];

const WRAPPER_ABI = [
  "function deposit(uint256)",
  "function withdraw(uint256)",
  "function token() view returns (address)",
  "function foreignAsset() view returns (address)",
];

// ─── Helpers ────────────────────────────────────────────────────────────────
function env(key: string): string {
  const v = process.env[key];
  if (!v) throw new Error(`Missing env variable: ${key}`);
  return v;
}

function ok(label: string) {
  console.log(`  ✅ ${label}`);
}
function fail(label: string) {
  console.error(`  ❌ ${label}`);
  process.exitCode = 1;
}

async function main() {
  // ── Read addresses from env ─────────────────────────────────────────
  const wrapperAddr  = env("WRAPPER_ADDRESS");
  const erc20Addr    = env("ERC20_ADDRESS");
  const foreignAddr  = env("FOREIGN_ASSET");
  const amountHuman  = process.env.AMOUNT || "100";

  const [signer] = await ethers.getSigners();
  const user = signer.address;
  console.log(`\n🔗 Network:  ${(await ethers.provider.getNetwork()).chainId}`);
  console.log(`👤 Account:  ${user}`);
  console.log(`💰 Wrapper:  ${wrapperAddr}`);
  console.log(`🪙  ERC20:   ${erc20Addr}`);
  console.log(`🏦 Foreign:  ${foreignAddr}`);
  console.log(`📦 Amount:   ${amountHuman}\n`);

  // ── Connect contracts ───────────────────────────────────────────────
  const wrapper  = new ethers.Contract(wrapperAddr, WRAPPER_ABI, signer);
  const erc20    = new ethers.Contract(erc20Addr, ERC20_ABI, signer);
  const foreign  = new ethers.Contract(foreignAddr, ERC20_ABI, signer);

  // ── Read decimals ───────────────────────────────────────────────────
  let decimals: number;
  try {
    decimals = Number(await erc20.decimals());
  } catch {
    console.log("  ⚠️  Could not read decimals from ERC20, defaulting to 12");
    decimals = 12;
  }
  const amount = ethers.parseUnits(amountHuman, decimals);

  // ═══════════════════════════════════════════════════════════════════
  //  1. PRE-CONDITIONS
  // ═══════════════════════════════════════════════════════════════════
  console.log("═══ Step 1: Pre-condition checks ═══");

  const foreignBal0: bigint = await foreign.balanceOf(user);
  const wrappedBal0: bigint = await erc20.balanceOf(user);
  const treasuryBal0: bigint = await foreign.balanceOf(wrapperAddr);
  const supply0: bigint = await erc20.totalSupply();

  console.log(`  Foreign AJUN balance : ${ethers.formatUnits(foreignBal0, decimals)}`);
  console.log(`  wAJUN balance        : ${ethers.formatUnits(wrappedBal0, decimals)}`);
  console.log(`  Treasury locked      : ${ethers.formatUnits(treasuryBal0, decimals)}`);
  console.log(`  wAJUN total supply   : ${ethers.formatUnits(supply0, decimals)}`);

  if (foreignBal0 < amount) {
    fail(`Insufficient foreign asset balance. Have ${ethers.formatUnits(foreignBal0, decimals)}, need ${amountHuman}.`);
    return;
  }
  ok("Sufficient foreign asset balance");

  // Invariant: totalSupply == treasury locked balance
  if (supply0 === treasuryBal0) {
    ok(`Invariant holds: totalSupply == treasuryLocked (${ethers.formatUnits(supply0, decimals)})`);
  } else {
    fail(`Invariant BROKEN: totalSupply=${ethers.formatUnits(supply0, decimals)} != treasuryLocked=${ethers.formatUnits(treasuryBal0, decimals)}`);
  }

  // ═══════════════════════════════════════════════════════════════════
  //  2. WRAP: Approve + Deposit
  // ═══════════════════════════════════════════════════════════════════
  console.log("\n═══ Step 2: Wrap (AJUN → wAJUN) ═══");

  console.log("  Approving foreign asset for Wrapper...");
  const approveTx1 = await foreign.approve(wrapperAddr, amount);
  await approveTx1.wait();
  ok("Approval confirmed");

  const allowance1: bigint = await foreign.allowance(user, wrapperAddr);
  console.log(`  Foreign allowance: ${ethers.formatUnits(allowance1, decimals)}`);

  console.log("  Calling deposit()...");
  const depositTx = await wrapper.deposit(amount);
  const depositReceipt = await depositTx.wait();
  ok(`Deposit confirmed (block ${depositReceipt?.blockNumber})`);

  // Verify post-deposit
  const foreignBal1: bigint = await foreign.balanceOf(user);
  const wrappedBal1: bigint = await erc20.balanceOf(user);
  const treasuryBal1: bigint = await foreign.balanceOf(wrapperAddr);
  const supply1: bigint = await erc20.totalSupply();

  console.log(`  Foreign AJUN balance : ${ethers.formatUnits(foreignBal1, decimals)}`);
  console.log(`  wAJUN balance        : ${ethers.formatUnits(wrappedBal1, decimals)}`);
  console.log(`  Treasury locked      : ${ethers.formatUnits(treasuryBal1, decimals)}`);

  if (foreignBal1 === foreignBal0 - amount) {
    ok("Foreign balance decreased correctly");
  } else {
    fail("Foreign balance mismatch after deposit");
  }

  if (wrappedBal1 === wrappedBal0 + amount) {
    ok("wAJUN balance increased correctly");
  } else {
    fail("wAJUN balance mismatch after deposit");
  }

  if (supply1 === treasuryBal1) {
    ok(`Invariant holds: totalSupply == treasuryLocked (${ethers.formatUnits(supply1, decimals)})`);
  } else {
    fail(`Invariant BROKEN after deposit`);
  }

  // ═══════════════════════════════════════════════════════════════════
  //  3. UNWRAP: Approve + Withdraw
  // ═══════════════════════════════════════════════════════════════════
  console.log("\n═══ Step 3: Unwrap (wAJUN → AJUN) ═══");

  console.log("  Approving wAJUN for Wrapper (burnFrom needs allowance)...");
  const approveTx2 = await erc20.approve(wrapperAddr, amount);
  await approveTx2.wait();
  ok("Approval confirmed");

  console.log("  Calling withdraw()...");
  const withdrawTx = await wrapper.withdraw(amount);
  const withdrawReceipt = await withdrawTx.wait();
  ok(`Withdraw confirmed (block ${withdrawReceipt?.blockNumber})`);

  // Verify post-withdraw
  const foreignBal2: bigint = await foreign.balanceOf(user);
  const wrappedBal2: bigint = await erc20.balanceOf(user);
  const treasuryBal2: bigint = await foreign.balanceOf(wrapperAddr);
  const supply2: bigint = await erc20.totalSupply();

  console.log(`  Foreign AJUN balance : ${ethers.formatUnits(foreignBal2, decimals)}`);
  console.log(`  wAJUN balance        : ${ethers.formatUnits(wrappedBal2, decimals)}`);
  console.log(`  Treasury locked      : ${ethers.formatUnits(treasuryBal2, decimals)}`);

  if (foreignBal2 === foreignBal0) {
    ok("Foreign balance restored to original");
  } else {
    fail("Foreign balance NOT restored");
  }

  if (wrappedBal2 === wrappedBal0) {
    ok("wAJUN balance restored to original");
  } else {
    fail("wAJUN balance NOT restored");
  }

  if (supply2 === treasuryBal2) {
    ok(`Invariant holds: totalSupply == treasuryLocked (${ethers.formatUnits(supply2, decimals)})`);
  } else {
    fail(`Invariant BROKEN after withdraw`);
  }

  // ═══════════════════════════════════════════════════════════════════
  //  SUMMARY
  // ═══════════════════════════════════════════════════════════════════
  console.log("\n════════════════════════════════════════════");
  if (process.exitCode) {
    console.log("  ❌ E2E TEST FAILED — see errors above");
  } else {
    console.log("  ✅ E2E TEST PASSED — full wrap/unwrap cycle verified");
  }
  console.log("════════════════════════════════════════════\n");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

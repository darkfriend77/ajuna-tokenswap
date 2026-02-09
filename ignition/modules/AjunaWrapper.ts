import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

const AjunaWrapperModule = buildModule("AjunaWrapperModule", (m) => {
  // Foreign Asset Precompile Address — must be set correctly for each target network.
  // Default: 0x...0801 (generic precompile). Override via ignition parameters for real deployments.
  const foreignAssetAddress = m.getParameter(
    "foreignAssetAddress",
    "0x0000000000000000000000000000000000000801"
  );

  // Decimals must match the native AJUN asset (12 on Ajuna Network).
  const tokenDecimals = m.getParameter("tokenDecimals", 12);

  const adminAddress = m.getAccount(0); // Deployer is initial admin

  // 1. Deploy AjunaERC20 (with configurable decimals)
  const token = m.contract("AjunaERC20", [
    "Wrapped Ajuna",
    "WAJUN",
    adminAddress,
    tokenDecimals,
  ]);

  // 2. Deploy AjunaWrapper (treasury)
  const wrapper = m.contract("AjunaWrapper", [token, foreignAssetAddress]);

  // 3. Grant MINTER_ROLE to Wrapper so it can mint and burnFrom
  // MINTER_ROLE = keccak256("MINTER_ROLE")
  const MINTER_ROLE =
    "0x9f2df0fed2c77648de5860a4cc508cd0818c85b8b8a1ab4ceeef8d981c8956a6";
  m.call(token, "grantRole", [MINTER_ROLE, wrapper]);

  // NOTE: After deployment, manually:
  //   1. Transfer DEFAULT_ADMIN_ROLE to a multisig, then renounce from deployer.
  //   2. Send 1–2 DOT to the wrapper address as Existential Deposit to prevent account reaping.

  return { token, wrapper };
});

export default AjunaWrapperModule;

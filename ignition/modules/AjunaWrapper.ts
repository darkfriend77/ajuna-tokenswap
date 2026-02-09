import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

const AjunaWrapperModule = buildModule("AjunaWrapperModule", (m) => {
  // Parameters
  // Foreign Asset Precompile Address (e.g. from converting Asset ID)
  // Default to a placeholder if not provided. In testnet/mainnet this must be accurate.
  // For local dev with mock, we might deploy a mock token first?
  // But for the actual module, let's assume valid input.
  
  // Example "Generic" Precompile or specific address
  const foreignAssetAddress = m.getParameter("foreignAssetAddress", "0x0000000000000000000000000000000000000801"); 
  const adminAddress = m.getAccount(0); // Deployer is admin

  // 1. Deploy AjunaERC20
  const token = m.contract("AjunaERC20", [
    "Wrapped Ajuna",
    "WAJUN",
    adminAddress
  ]);

  // 2. Deploy Wrapper
  const wrapper = m.contract("AjunaWrapper", [
    token,
    foreignAssetAddress
  ]);

  // 3. Grant MINTER_ROLE to Wrapper
  // MINTER_ROLE = keccak256("MINTER_ROLE")
  const MINTER_ROLE = "0x9f2df0fed2c77648de5860a4cc508cd0818c85b8b8a1ab4ceeef8d981c8956a6";
  
  m.call(token, "grantRole", [MINTER_ROLE, wrapper]);

  return { token, wrapper };
});

export default AjunaWrapperModule;

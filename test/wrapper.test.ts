import { expect } from "chai";
import { ethers } from "hardhat";
import { AjunaERC20, AjunaWrapper, IERC20Precompile } from "../typechain-types"; // Assuming typechain is generated
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";

describe("AjunaWrapper System", function () {
  let token: AjunaERC20;
  let wrapper: AjunaWrapper;
  let foreignAssetMock: any; // Using a mock for local testing
  let owner: SignerWithAddress;
  let user: SignerWithAddress;

  // Constants
  const INITIAL_SUPPLY = ethers.parseEther("1000");

  before(async function () {
    [owner, user] = await ethers.getSigners();
  });

  beforeEach(async function () {
    // 1. Deploy Mock Foreign Asset (using AjunaERC20 as a mock implementation for simplicity)
    // In real PVM node, we might point to precompile, but for logic testing, a mock ERC20 is fine
    // provided the interface matches.
    const MockFactory = await ethers.getContractFactory("AjunaERC20");
    foreignAssetMock = await MockFactory.deploy("Foreign AJUN", "FAJUN", owner.address);
    await foreignAssetMock.waitForDeployment();
    // Mint some to user
    await foreignAssetMock.grantRole(await foreignAssetMock.MINTER_ROLE(), owner.address);
    await foreignAssetMock.mint(user.address, INITIAL_SUPPLY);

    // 2. Deploy Real Contracts
    const TokenFactory = await ethers.getContractFactory("AjunaERC20");
    token = await TokenFactory.deploy("Wrapped Ajuna", "WAJUN", owner.address);
    await token.waitForDeployment();

    const WrapperFactory = await ethers.getContractFactory("AjunaWrapper");
    wrapper = await WrapperFactory.deploy(await token.getAddress(), await foreignAssetMock.getAddress());
    await wrapper.waitForDeployment();

    // 3. Setup Permissions
    const MINTER_ROLE = await token.MINTER_ROLE();
    await token.grantRole(MINTER_ROLE, await wrapper.getAddress());
  });

  it("Should wrap (deposit) Foreign Assets", async function () {
    const amount = ethers.parseEther("10");

    // Approve Wrapper to spend Foreign Asset
    await foreignAssetMock.connect(user).approve(await wrapper.getAddress(), amount);

    // Deposit
    await expect(wrapper.connect(user).deposit(amount))
        .to.emit(wrapper, "Deposited")
        .withArgs(user.address, amount);

    // Check Balances
    expect(await token.balanceOf(user.address)).to.equal(amount);
    expect(await foreignAssetMock.balanceOf(await wrapper.getAddress())).to.equal(amount);
  });

  it("Should unwrap (withdraw) ERC20 tokens", async function () {
    const amount = ethers.parseEther("10");

    // Setup: Wrap first
    await foreignAssetMock.connect(user).approve(await wrapper.getAddress(), amount);
    await wrapper.connect(user).deposit(amount);

    // Withdraw
    // Note: No approval needed for burn if logic supports it, but our logic calls burn() which is role protected.
    // The Wrapper calls token.burn(msg.sender, amount). 
    // This requires Wrapper to have MINTER_ROLE (which allows burn).
    // Does burn() check allowance? 
    // OpenZeppelin ERC20 _burn(account, amount) does NOT check allowance.
    // However, burn() is external. 
    // Wait, our implementation:
    // function burn(address from, uint256 amount) external onlyRole(MINTER_ROLE) { _burn(from, amount); }
    // The Wrapper calls token.burn(msg.sender, amount).
    // The Wrapper HAS MINTER_ROLE.
    // So it can burn anyone's tokens? Yes, if strict implementation.
    // Standard ERC20Wrapper usually requires transferFrom(user -> wrapper) then burn,
    // OR burnFrom(user). 
    // Our custom burn implementation allows MINTER_ROLE to burn from ANY address.
    // This is powerful. Is it safe? 
    // Only the Wrapper has this role. The Wrapper logic only calls it in withdraw(),
    // where it checks msg.sender. So it only burns msg.sender's tokens. Safe.
    
    await expect(wrapper.connect(user).withdraw(amount))
        .to.emit(wrapper, "Withdrawn")
        .withArgs(user.address, amount);

    expect(await token.balanceOf(user.address)).to.equal(0);
    expect(await foreignAssetMock.balanceOf(user.address)).to.equal(INITIAL_SUPPLY);
  });
});

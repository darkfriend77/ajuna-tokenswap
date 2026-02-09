import { expect } from "chai";
import { ethers } from "hardhat";
import { AjunaERC20, AjunaWrapper } from "../typechain-types";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";

describe("AjunaWrapper System", function () {
  let token: AjunaERC20;
  let wrapper: AjunaWrapper;
  let foreignAssetMock: AjunaERC20; // Mock ERC20 standing in for the precompile
  let owner: SignerWithAddress;
  let user: SignerWithAddress;
  let user2: SignerWithAddress;

  const DECIMALS = 12;
  const INITIAL_SUPPLY = ethers.parseUnits("1000", DECIMALS);
  const ZERO_ADDRESS = ethers.ZeroAddress;

  before(async function () {
    [owner, user, user2] = await ethers.getSigners();
  });

  beforeEach(async function () {
    // 1. Deploy mock Foreign Asset (AjunaERC20 as stand-in for the precompile)
    const MockFactory = await ethers.getContractFactory("AjunaERC20");
    foreignAssetMock = await MockFactory.deploy("Foreign AJUN", "FAJUN", owner.address, DECIMALS);
    await foreignAssetMock.waitForDeployment();
    await foreignAssetMock.grantRole(await foreignAssetMock.MINTER_ROLE(), owner.address);
    await foreignAssetMock.mint(user.address, INITIAL_SUPPLY);
    await foreignAssetMock.mint(user2.address, INITIAL_SUPPLY);

    // 2. Deploy real contracts
    const TokenFactory = await ethers.getContractFactory("AjunaERC20");
    token = await TokenFactory.deploy("Wrapped Ajuna", "WAJUN", owner.address, DECIMALS);
    await token.waitForDeployment();

    const WrapperFactory = await ethers.getContractFactory("AjunaWrapper");
    wrapper = await WrapperFactory.deploy(
      await token.getAddress(),
      await foreignAssetMock.getAddress()
    );
    await wrapper.waitForDeployment();

    // 3. Grant MINTER_ROLE to Wrapper
    const MINTER_ROLE = await token.MINTER_ROLE();
    await token.grantRole(MINTER_ROLE, await wrapper.getAddress());
  });

  // ─── Helper ───────────────────────────────────────────────
  async function checkInvariant() {
    const totalSupply = await token.totalSupply();
    const wrapperForeignBal = await foreignAssetMock.balanceOf(await wrapper.getAddress());
    expect(totalSupply).to.equal(wrapperForeignBal, "INVARIANT BROKEN: totalSupply != locked foreign assets");
  }

  // ═══════════════════════════════════════════════════════════
  //  Deployment
  // ═══════════════════════════════════════════════════════════

  describe("Deployment", function () {
    it("should set correct token and foreignAsset addresses", async function () {
      expect(await wrapper.token()).to.equal(await token.getAddress());
      expect(await wrapper.foreignAsset()).to.equal(await foreignAssetMock.getAddress());
    });

    it("should set correct decimals", async function () {
      expect(await token.decimals()).to.equal(DECIMALS);
    });

    it("should revert AjunaERC20 deployment with zero admin", async function () {
      const Factory = await ethers.getContractFactory("AjunaERC20");
      await expect(
        Factory.deploy("Test", "TST", ZERO_ADDRESS, 12)
      ).to.be.revertedWith("AjunaERC20: admin is zero address");
    });

    it("should revert AjunaWrapper deployment with zero token address", async function () {
      const Factory = await ethers.getContractFactory("AjunaWrapper");
      await expect(
        Factory.deploy(ZERO_ADDRESS, await foreignAssetMock.getAddress())
      ).to.be.revertedWith("AjunaWrapper: token is zero address");
    });

    it("should revert AjunaWrapper deployment with zero precompile address", async function () {
      const Factory = await ethers.getContractFactory("AjunaWrapper");
      await expect(
        Factory.deploy(await token.getAddress(), ZERO_ADDRESS)
      ).to.be.revertedWith("AjunaWrapper: precompile is zero address");
    });
  });

  // ═══════════════════════════════════════════════════════════
  //  Deposit (Wrap)
  // ═══════════════════════════════════════════════════════════

  describe("Deposit (Wrap)", function () {
    const amount = ethers.parseUnits("100", DECIMALS);

    it("should wrap Foreign Assets and emit Deposited event", async function () {
      await foreignAssetMock.connect(user).approve(await wrapper.getAddress(), amount);

      await expect(wrapper.connect(user).deposit(amount))
        .to.emit(wrapper, "Deposited")
        .withArgs(user.address, amount);

      expect(await token.balanceOf(user.address)).to.equal(amount);
      expect(await foreignAssetMock.balanceOf(await wrapper.getAddress())).to.equal(amount);
      await checkInvariant();
    });

    it("should revert on zero amount", async function () {
      await expect(wrapper.connect(user).deposit(0)).to.be.revertedWith("Amount must be > 0");
    });

    it("should revert without prior approval", async function () {
      await expect(wrapper.connect(user).deposit(amount)).to.be.reverted;
    });

    it("should maintain invariant after multiple deposits", async function () {
      const amt1 = ethers.parseUnits("50", DECIMALS);
      const amt2 = ethers.parseUnits("30", DECIMALS);

      await foreignAssetMock.connect(user).approve(await wrapper.getAddress(), amt1 + amt2);
      await wrapper.connect(user).deposit(amt1);
      await checkInvariant();
      await wrapper.connect(user).deposit(amt2);
      await checkInvariant();

      expect(await token.totalSupply()).to.equal(amt1 + amt2);
    });
  });

  // ═══════════════════════════════════════════════════════════
  //  Withdraw (Unwrap)
  // ═══════════════════════════════════════════════════════════

  describe("Withdraw (Unwrap)", function () {
    const depositAmount = ethers.parseUnits("100", DECIMALS);
    const withdrawAmount = ethers.parseUnits("60", DECIMALS);

    beforeEach(async function () {
      // Setup: wrap first so user has wAJUN
      await foreignAssetMock.connect(user).approve(await wrapper.getAddress(), depositAmount);
      await wrapper.connect(user).deposit(depositAmount);
    });

    it("should unwrap ERC20 tokens and emit Withdrawn event", async function () {
      // User must approve wrapper to burnFrom their wAJUN
      await token.connect(user).approve(await wrapper.getAddress(), withdrawAmount);

      await expect(wrapper.connect(user).withdraw(withdrawAmount))
        .to.emit(wrapper, "Withdrawn")
        .withArgs(user.address, withdrawAmount);

      expect(await token.balanceOf(user.address)).to.equal(depositAmount - withdrawAmount);
      expect(await foreignAssetMock.balanceOf(user.address)).to.equal(
        INITIAL_SUPPLY - depositAmount + withdrawAmount
      );
      await checkInvariant();
    });

    it("should revert on zero amount", async function () {
      await expect(wrapper.connect(user).withdraw(0)).to.be.revertedWith("Amount must be > 0");
    });

    it("should revert with insufficient ERC20 balance", async function () {
      const tooMuch = depositAmount + 1n;
      await token.connect(user).approve(await wrapper.getAddress(), tooMuch);
      await expect(wrapper.connect(user).withdraw(tooMuch)).to.be.revertedWith(
        "Insufficient ERC20 balance"
      );
    });

    it("should revert without ERC20 approval (burnFrom requires allowance)", async function () {
      // User has wAJUN but has NOT approved wrapper
      await expect(wrapper.connect(user).withdraw(withdrawAmount)).to.be.reverted;
    });

    it("should maintain invariant after full unwrap", async function () {
      await token.connect(user).approve(await wrapper.getAddress(), depositAmount);
      await wrapper.connect(user).withdraw(depositAmount);
      await checkInvariant();
      expect(await token.totalSupply()).to.equal(0);
    });
  });

  // ═══════════════════════════════════════════════════════════
  //  Access Control
  // ═══════════════════════════════════════════════════════════

  describe("Access Control", function () {
    it("should prevent non-MINTER from calling mint", async function () {
      await expect(token.connect(user).mint(user.address, 100)).to.be.reverted;
    });

    it("should prevent non-MINTER from calling burnFrom", async function () {
      await expect(token.connect(user).burnFrom(user.address, 100)).to.be.reverted;
    });

    it("deployer should NOT have MINTER_ROLE by default", async function () {
      const MINTER_ROLE = await token.MINTER_ROLE();
      expect(await token.hasRole(MINTER_ROLE, owner.address)).to.be.false;
    });

    it("wrapper should have MINTER_ROLE", async function () {
      const MINTER_ROLE = await token.MINTER_ROLE();
      expect(await token.hasRole(MINTER_ROLE, await wrapper.getAddress())).to.be.true;
    });
  });

  // ═══════════════════════════════════════════════════════════
  //  Pausable
  // ═══════════════════════════════════════════════════════════

  describe("Pausable", function () {
    const amount = ethers.parseUnits("10", DECIMALS);

    it("should reject deposit when paused", async function () {
      await wrapper.connect(owner).pause();
      await foreignAssetMock.connect(user).approve(await wrapper.getAddress(), amount);
      await expect(wrapper.connect(user).deposit(amount)).to.be.reverted;
    });

    it("should reject withdraw when paused", async function () {
      // Setup: wrap first
      await foreignAssetMock.connect(user).approve(await wrapper.getAddress(), amount);
      await wrapper.connect(user).deposit(amount);

      await wrapper.connect(owner).pause();
      await token.connect(user).approve(await wrapper.getAddress(), amount);
      await expect(wrapper.connect(user).withdraw(amount)).to.be.reverted;
    });

    it("should resume after unpause", async function () {
      await foreignAssetMock.connect(user).approve(await wrapper.getAddress(), amount);
      await wrapper.connect(owner).pause();
      await expect(wrapper.connect(user).deposit(amount)).to.be.reverted;

      await wrapper.connect(owner).unpause();
      await wrapper.connect(user).deposit(amount);
      expect(await token.balanceOf(user.address)).to.equal(amount);
    });

    it("should only allow owner to pause/unpause", async function () {
      await expect(wrapper.connect(user).pause()).to.be.reverted;
      await expect(wrapper.connect(user).unpause()).to.be.reverted;
    });
  });

  // ═══════════════════════════════════════════════════════════
  //  Rescue
  // ═══════════════════════════════════════════════════════════

  describe("Rescue", function () {
    it("should rescue accidentally sent tokens", async function () {
      // Deploy a random token and send some to the wrapper
      const RandomFactory = await ethers.getContractFactory("AjunaERC20");
      const randomToken = await RandomFactory.deploy("Random", "RND", owner.address, 18);
      await randomToken.waitForDeployment();
      await randomToken.grantRole(await randomToken.MINTER_ROLE(), owner.address);
      await randomToken.mint(await wrapper.getAddress(), 1000);

      await wrapper.connect(owner).rescueToken(
        await randomToken.getAddress(),
        owner.address,
        1000
      );
      expect(await randomToken.balanceOf(owner.address)).to.equal(1000);
    });

    it("should NOT allow rescuing the locked foreign asset", async function () {
      await expect(
        wrapper.connect(owner).rescueToken(
          await foreignAssetMock.getAddress(),
          owner.address,
          1
        )
      ).to.be.revertedWith("Cannot rescue locked foreign asset");
    });

    it("should only allow owner to rescue", async function () {
      await expect(
        wrapper.connect(user).rescueToken(await token.getAddress(), user.address, 1)
      ).to.be.reverted;
    });
  });

  // ═══════════════════════════════════════════════════════════
  //  Foreign Asset Update
  // ═══════════════════════════════════════════════════════════

  describe("Foreign Asset Update", function () {
    it("should allow owner to update foreign asset address", async function () {
      const newAddr = ethers.Wallet.createRandom().address;
      await expect(wrapper.connect(owner).updateForeignAsset(newAddr))
        .to.emit(wrapper, "ForeignAssetUpdated")
        .withArgs(await foreignAssetMock.getAddress(), newAddr);

      expect(await wrapper.foreignAsset()).to.equal(newAddr);
    });

    it("should reject zero address", async function () {
      await expect(
        wrapper.connect(owner).updateForeignAsset(ZERO_ADDRESS)
      ).to.be.revertedWith("AjunaWrapper: new address is zero");
    });

    it("should reject non-owner", async function () {
      const newAddr = ethers.Wallet.createRandom().address;
      await expect(wrapper.connect(user).updateForeignAsset(newAddr)).to.be.reverted;
    });
  });

  // ═══════════════════════════════════════════════════════════
  //  Multi-User
  // ═══════════════════════════════════════════════════════════

  describe("Multi-User", function () {
    const amt1 = ethers.parseUnits("200", DECIMALS);
    const amt2 = ethers.parseUnits("150", DECIMALS);

    it("should handle interleaved wrap/unwrap from two users", async function () {
      // User1 wraps
      await foreignAssetMock.connect(user).approve(await wrapper.getAddress(), amt1);
      await wrapper.connect(user).deposit(amt1);
      await checkInvariant();

      // User2 wraps
      await foreignAssetMock.connect(user2).approve(await wrapper.getAddress(), amt2);
      await wrapper.connect(user2).deposit(amt2);
      await checkInvariant();

      expect(await token.totalSupply()).to.equal(amt1 + amt2);

      // User1 partially unwraps
      const unwrap1 = ethers.parseUnits("80", DECIMALS);
      await token.connect(user).approve(await wrapper.getAddress(), unwrap1);
      await wrapper.connect(user).withdraw(unwrap1);
      await checkInvariant();

      // User2 fully unwraps
      await token.connect(user2).approve(await wrapper.getAddress(), amt2);
      await wrapper.connect(user2).withdraw(amt2);
      await checkInvariant();

      expect(await token.totalSupply()).to.equal(amt1 - unwrap1);
    });
  });
});

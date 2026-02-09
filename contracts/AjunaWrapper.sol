// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "./AjunaERC20.sol";
import "./interfaces/IERC20Precompile.sol";

/**
 * @title AjunaWrapper
 * @notice Treasury contract that wraps AJUN Foreign Assets into ERC20 wAJUN tokens and vice-versa.
 * @dev Implements the Mint-and-Lock pattern:
 *      - deposit(): user locks Foreign AJUN → treasury mints wAJUN
 *      - withdraw(): user burns wAJUN (via approval) → treasury releases Foreign AJUN
 *
 *      Invariant: token.totalSupply() == foreignAsset.balanceOf(address(this))
 *
 *      Security features:
 *      - ReentrancyGuard on all state-changing user functions
 *      - Pausable circuit breaker (owner-only)
 *      - Rescue function for accidentally sent tokens (cannot rescue the locked foreign asset)
 *      - Mutable foreignAsset address to handle pallet-revive precompile address changes
 */
contract AjunaWrapper is Ownable, ReentrancyGuard, Pausable {
    /// @notice The wrapped ERC20 token (wAJUN) managed by this treasury.
    AjunaERC20 public immutable token;

    /// @notice The Foreign Asset precompile (AJUN). Mutable to allow governance updates if the
    ///         precompile address changes due to a runtime upgrade.
    IERC20Precompile public foreignAsset;

    /// @notice Emitted when a user wraps Foreign AJUN into wAJUN.
    event Deposited(address indexed user, uint256 amount);
    /// @notice Emitted when a user unwraps wAJUN back into Foreign AJUN.
    event Withdrawn(address indexed user, uint256 amount);
    /// @notice Emitted when the owner updates the Foreign Asset precompile address.
    event ForeignAssetUpdated(address indexed oldAddress, address indexed newAddress);
    /// @notice Emitted when the owner rescues accidentally sent tokens.
    event TokenRescued(address indexed tokenAddress, address indexed to, uint256 amount);

    /**
     * @notice Deploys the wrapper treasury.
     * @param _token                  Address of the deployed AjunaERC20 contract.
     * @param _foreignAssetPrecompile Address of the Foreign Asset precompile on AssetHub.
     */
    constructor(
        address _token,
        address _foreignAssetPrecompile
    ) Ownable(msg.sender) {
        require(_token != address(0), "AjunaWrapper: token is zero address");
        require(_foreignAssetPrecompile != address(0), "AjunaWrapper: precompile is zero address");
        token = AjunaERC20(_token);
        foreignAsset = IERC20Precompile(_foreignAssetPrecompile);
    }

    // ──────────────────────────────────────────────
    //  Core: Wrap / Unwrap
    // ──────────────────────────────────────────────

    /**
     * @notice Wraps Foreign AJUN into ERC20 wAJUN.
     * @dev The caller must have approved this contract on the Foreign Asset precompile beforehand.
     *      Flow: foreignAsset.transferFrom(user → treasury) → token.mint(user)
     * @param amount Amount of Foreign AJUN to wrap (in smallest unit).
     */
    function deposit(uint256 amount) external nonReentrant whenNotPaused {
        require(amount > 0, "Amount must be > 0");

        // 1. Pull Foreign Assets from user into treasury
        bool success = foreignAsset.transferFrom(
            msg.sender,
            address(this),
            amount
        );
        require(success, "Foreign Asset transfer failed. Check allowance?");

        // 2. Mint equivalent wAJUN to user
        token.mint(msg.sender, amount);

        emit Deposited(msg.sender, amount);
    }

    /**
     * @notice Unwraps ERC20 wAJUN back into Foreign AJUN.
     * @dev The caller must have approved this contract on the wAJUN ERC20 token beforehand
     *      (standard burnFrom pattern).
     *      Flow: token.burnFrom(user) → foreignAsset.transfer(treasury → user)
     * @param amount Amount of wAJUN to unwrap (in smallest unit).
     */
    function withdraw(uint256 amount) external nonReentrant whenNotPaused {
        require(amount > 0, "Amount must be > 0");
        require(
            token.balanceOf(msg.sender) >= amount,
            "Insufficient ERC20 balance"
        );

        // 1. Burn user's wAJUN (requires prior ERC20 approval to this contract)
        token.burnFrom(msg.sender, amount);

        // 2. Release Foreign Assets from treasury back to user
        bool success = foreignAsset.transfer(msg.sender, amount);
        require(success, "Foreign Asset return transfer failed");

        emit Withdrawn(msg.sender, amount);
    }

    // ──────────────────────────────────────────────
    //  Admin: Pause / Unpause
    // ──────────────────────────────────────────────

    /// @notice Pauses all deposit and withdraw operations. Owner-only emergency circuit breaker.
    function pause() external onlyOwner {
        _pause();
    }

    /// @notice Unpauses deposit and withdraw operations.
    function unpause() external onlyOwner {
        _unpause();
    }

    // ──────────────────────────────────────────────
    //  Admin: Foreign Asset Address Update
    // ──────────────────────────────────────────────

    /**
     * @notice Updates the Foreign Asset precompile address.
     * @dev Use this if the precompile address changes due to a pallet-revive runtime upgrade.
     *      Should be restricted to a multisig or governance timelock in production.
     * @param _newForeignAsset The new precompile address.
     */
    function updateForeignAsset(address _newForeignAsset) external onlyOwner {
        require(_newForeignAsset != address(0), "AjunaWrapper: new address is zero");
        address oldAddress = address(foreignAsset);
        foreignAsset = IERC20Precompile(_newForeignAsset);
        emit ForeignAssetUpdated(oldAddress, _newForeignAsset);
    }

    // ──────────────────────────────────────────────
    //  Admin: Rescue Accidentally Sent Tokens
    // ──────────────────────────────────────────────

    /**
     * @notice Rescues ERC20 tokens accidentally sent to this contract.
     * @dev Cannot be used to withdraw the locked Foreign Asset — that would break the 1:1 backing.
     * @param tokenAddress Address of the token to rescue.
     * @param to           Recipient of the rescued tokens.
     * @param amount       Amount to rescue.
     */
    function rescueToken(address tokenAddress, address to, uint256 amount) external onlyOwner {
        require(tokenAddress != address(foreignAsset), "Cannot rescue locked foreign asset");
        require(to != address(0), "AjunaWrapper: rescue to zero address");
        IERC20(tokenAddress).transfer(to, amount);
        emit TokenRescued(tokenAddress, to, amount);
    }
}

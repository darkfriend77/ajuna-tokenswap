// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "./AjunaERC20.sol";
import "./interfaces/IERC20Precompile.sol";

contract AjunaWrapper is Ownable, ReentrancyGuard {
    AjunaERC20 public immutable token;
    IERC20Precompile public immutable foreignAsset;

    event Deposited(address indexed user, uint256 amount);
    event Withdrawn(address indexed user, uint256 amount);

    /**
     * @param _token Address of the deployed AjunaERC20 Contract.
     * @param _foreignAssetPrecompile Address of the Foreign Asset Precompile on AssetHub.
     */
    constructor(
        address _token,
        address _foreignAssetPrecompile
    ) Ownable(msg.sender) {
        token = AjunaERC20(_token);
        foreignAsset = IERC20Precompile(_foreignAssetPrecompile);
    }

    /**
     * @dev Wraps Foreign AJUN into ERC20 AJUN.
     * The user must have approved this contract on the Foreign Asset Precompile beforehand.
     */
    function deposit(uint256 amount) external nonReentrant {
        require(amount > 0, "Amount must be > 0");

        // 1. Transfer Foreign Assets from user to Treasury (this contract)
        // Uses transferFrom. Fails if no allowance exists.
        bool success = foreignAsset.transferFrom(
            msg.sender,
            address(this),
            amount
        );
        require(success, "Foreign Asset transfer failed. Check allowance?");

        // 2. Mint equivalent ERC20 tokens to the user
        token.mint(msg.sender, amount);

        emit Deposited(msg.sender, amount);
    }

    /**
     * @dev Unwraps ERC20 AJUN back to Foreign AJUN.
     * The user must have approved this contract on the ERC20 Token (or we use burn if role allows).
     * Since Wrapper has MINTER_ROLE (which implies burner usually in our design), we can burn directly/via burnFrom equivalent.
     * Our AjunaERC20 has a 'burn' function protected by MINTER_ROLE.
     */
    function withdraw(uint256 amount) external nonReentrant {
        require(amount > 0, "Amount must be > 0");
        require(
            token.balanceOf(msg.sender) >= amount,
            "Insufficient ERC20 balance"
        );

        // 1. Burn the user's ERC20 tokens
        // Since we have MINTER_ROLE, we can call burn(from, amount)
        token.burn(msg.sender, amount);

        // 2. Transfer Foreign Assets from Treasury back to user
        bool success = foreignAsset.transfer(msg.sender, amount);
        require(success, "Foreign Asset return transfer failed");

        emit Withdrawn(msg.sender, amount);
    }

    // Function to rescue other tokens or update config could be added here
}

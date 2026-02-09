// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";

/**
 * @title AjunaERC20
 * @dev Represents the Foreign Asset as an ERC20 Token on Polkadot AssetHub.
 * Implements AccessControl for strict minting rights.
 */
contract AjunaERC20 is ERC20, AccessControl {
    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");

    constructor(
        string memory name,
        string memory symbol,
        address admin
    ) ERC20(name, symbol) {
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
    }

    /**
     * @dev Creates new tokens. Can only be called by accounts with MINTER_ROLE.
     * @param to Address of the beneficiary.
     * @param amount Amount of tokens to mint.
     */
    function mint(address to, uint256 amount) external onlyRole(MINTER_ROLE) {
        _mint(to, amount);
    }

    /**
     * @dev Destroys tokens. Can only be called by accounts with MINTER_ROLE.
     * Used when users unwrap their tokens back to the original asset.
     * @param from Address from which tokens are burned.
     * @param amount Amount of tokens to burn.
     */
    function burn(address from, uint256 amount) external onlyRole(MINTER_ROLE) {
        _burn(from, amount);
    }
}

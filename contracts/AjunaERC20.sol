// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";

/**
 * @title AjunaERC20
 * @notice Wrapped representation of the AJUN Foreign Asset as an ERC20 token on Polkadot AssetHub.
 * @dev Uses OpenZeppelin AccessControl for role-gated minting and burning.
 *      Only accounts with MINTER_ROLE (intended: the AjunaWrapper treasury) can mint or burn.
 *      Burning requires prior ERC20 approval from the token holder (standard burnFrom pattern).
 */
contract AjunaERC20 is ERC20, AccessControl {
    /// @notice Role identifier for accounts permitted to mint and burn tokens.
    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");

    /// @dev Token decimals, set once at construction to match the native AJUN asset.
    uint8 private immutable _decimals;

    /**
     * @notice Deploys the wrapped AJUN ERC20 token.
     * @param name_   Token name (e.g. "Wrapped Ajuna").
     * @param symbol_ Token symbol (e.g. "WAJUN").
     * @param admin   Address that receives DEFAULT_ADMIN_ROLE (can later grant MINTER_ROLE).
     * @param decimals_ Number of decimals — must match the native AJUN asset (typically 12).
     */
    constructor(
        string memory name_,
        string memory symbol_,
        address admin,
        uint8 decimals_
    ) ERC20(name_, symbol_) {
        require(admin != address(0), "AjunaERC20: admin is zero address");
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _decimals = decimals_;
    }

    /// @notice Returns the number of decimals used for display purposes.
    function decimals() public view override returns (uint8) {
        return _decimals;
    }

    /**
     * @notice Creates `amount` new tokens and assigns them to `to`.
     * @dev Restricted to accounts with MINTER_ROLE.
     * @param to     Recipient of the minted tokens.
     * @param amount Number of tokens to mint (in smallest unit).
     */
    function mint(address to, uint256 amount) external onlyRole(MINTER_ROLE) {
        _mint(to, amount);
    }

    /**
     * @notice Burns `amount` tokens from `from`, deducting from the caller's allowance.
     * @dev Restricted to accounts with MINTER_ROLE.
     *      The caller (e.g. AjunaWrapper) must have been approved by `from` via `approve()`.
     *      This follows the standard ERC20 "burnFrom" pattern for safety.
     * @param from   Address whose tokens will be burned.
     * @param amount Number of tokens to burn (in smallest unit).
     */
    function burnFrom(address from, uint256 amount) public onlyRole(MINTER_ROLE) {
        _spendAllowance(from, _msgSender(), amount);
        _burn(from, amount);
    }
}

pragma solidity ^0.4.11;

import "./ERC223.sol";

contract YouStockToken is ERC223Token {

  constructor(uint8 _decimals, uint256 _totalSupply, string _name, string _symbol) public {
    decimals = _decimals;
    totalSupply = _totalSupply;
    name = _name;
    symbol = _symbol;
    balances[msg.sender] = _totalSupply;
  }
  
}

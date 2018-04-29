pragma solidity ^0.4.11;

import "./ERC223.sol";

contract YouStockToken is ERC223Token {
  string public name = "YouStockToken";
  string public symbol = "ANT";
  uint public decimals = 6;
  uint public INITIAL_SUPPLY = 10000000000;

  function YouStockToken() {
    totalSupply = INITIAL_SUPPLY;
    balances[msg.sender] = INITIAL_SUPPLY;
  }
}

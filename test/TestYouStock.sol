pragma solidity ^0.4.2;

import "truffle/Assert.sol";
import "truffle/DeployedAddresses.sol";
import "../contracts/YouStockExchange.sol";

contract TestYouStockExchange {
  function testTokenAddress() {
    YouStockExchange yse = YouStockExchange(DeployedAddresses.YouStockExchange());
    uint256 feeMultiplier = yse.feeMultiplier();

    Assert.equal(feeMultiplier, 1000, "YouStockExchange charges market takers 0.1% fee and gives it to market makers.");
  }
}

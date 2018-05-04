pragma solidity ^0.4.2;

import "truffle/Assert.sol";
import "truffle/DeployedAddresses.sol";
import "../contracts/YouStock.sol";

contract TestYouStock {
  function testTokenAddress() {
    YouStock yse = YouStock(DeployedAddresses.YouStock());
  }
}

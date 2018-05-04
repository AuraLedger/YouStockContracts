var YouStockNomadERC20Token = artifacts.require("./YouStockNomadExample.sol");
var YouStockNomadERC223Token = artifacts.require("./YouStockNomadExample.sol");

module.exports = function(deployer, network, accounts) {
  deployer.deploy(YouStockNomadERC20Token);
  deployer.deploy(YouStockNomadERC223Token);
};

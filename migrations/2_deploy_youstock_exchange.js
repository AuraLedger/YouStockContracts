var YouStock = artifacts.require("./YouStock.sol");

module.exports = function(deployer, network, accounts) {
  deployer.deploy(YouStock);
};

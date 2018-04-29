var YouStockExchange = artifacts.require("./YouStockExchange.sol");

module.exports = function(deployer, network, accounts) {
  deployer.deploy(YouStockExchange);
};

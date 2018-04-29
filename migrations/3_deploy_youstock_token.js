var YouStockToken = artifacts.require("./YouStockToken.sol");

module.exports = function(deployer, network, accounts) {
  deployer.deploy(YouStockToken, 6, 10000, 'YouStockToken', 'YST');
};

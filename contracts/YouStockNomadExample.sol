pragma solidity ^0.4.22;

import './ERC20.sol';
import './ERC223.sol';
import './YouStock.sol';

// a standard ERC20 token that is funded from a YouStock token
contract YouStockNomadERC20Token is YouStockReceiver, StandardToken {
    address constant YOU_STOCK_MAIN = 0x0; //address of main youstock contract
    address constant YOU_STOCK_TOKEN = 0x0; // address of main youstock user token
    
    constructor() public {
        totalSupply = 0; //supply represents how much has been transfered to this contract
        decimals = 6;
    }
    
    function receiveYouStockTokens(address token, address owner, uint64 amount) external {
        require(msg.sender == YOU_STOCK_MAIN);
        require(token == YOU_STOCK_TOKEN);
        totalSupply += amount;
        balances[owner] += amount;
    }
    
    function sendBackToYouStock(uint64 amount) external {
        balances[msg.sender].sub(amount);
        totalSupply -= amount;
        YouStock(YOU_STOCK_MAIN).transfer(YOU_STOCK_TOKEN, msg.sender, amount);
    }
}

// a standard ERC223 token that is funded from a YouStock token
contract YouStockNomadERC223Token is YouStockReceiver, ERC223Token {
    address constant YOU_STOCK_MAIN = 0x0; //address of main youstock contract
    address constant YOU_STOCK_TOKEN = 0x0; // address of main youstock user token
    
    constructor() public {
        totalSupply = 0; //supply represents how much has been transfered to this contract
        decimals = 6;
        name = "YouStockNomadERC223Token";
        symbol = "YSET";
    }
    
    function receiveYouStockTokens(address token, address owner, uint64 amount) external {
        require(msg.sender == YOU_STOCK_MAIN);
        require(token == YOU_STOCK_TOKEN);
        totalSupply += amount;
        balances[owner] += amount;
    }
    
    function sendBackToYouStock(uint64 amount) external {
        balances[msg.sender].sub(amount);
        totalSupply -= amount;
        YouStock(YOU_STOCK_MAIN).transfer(YOU_STOCK_TOKEN, msg.sender, amount);
    }
}

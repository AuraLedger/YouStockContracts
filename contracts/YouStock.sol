pragma solidity ^0.4.22;

// YouStock is a self contained token factory and decentralized exchange
// as little data as needed is kept on chain 
// things like token name, decimals, ticker should be stored off chain
// doesn't use events, events can be simulated by watching new transactions
// all tokens have 1 million units divisible to 6 decimals
// there are two reasons for the above decision
// 1 - simplifies order filling
// 2 - prevents unit bias in the market

// if you want to use native YouStock tokens in another contract, it must 
// implement this method to receive the tokens
contract YouStockReceiver {
    function receiveYouStockTokens(address token, address owner, uint64 amount) external;
}

contract YouStock {

    struct Order {
        address owner;
        uint64 amount; // amount of token being bought or sold 
        uint64 price; // price (wei per microtoken)
    }
    
    uint64 constant TOTAL_SUPPLY = 10**12;
    
    // token => user => balance
    mapping(address => mapping(address => uint64)) public balances;
    
    // order books
    // token => orderId => order
    mapping(address => mapping(uint64 => Order)) public buys;
    mapping(address => mapping(uint64 => Order)) public sells;
    
    // token => created
    mapping(address => bool) public created;

    uint64 private latestOrderId;
    
    function createToken() external {
        require(!created[msg.sender]);
        balances[msg.sender][msg.sender] = TOTAL_SUPPLY;
        created[msg.sender] = true;
    }
    
    function transfer(address token, address to, uint64 amount) external {
        uint64 bal = balances[token][msg.sender];
        require(bal >= amount);
        balances[token][msg.sender] = bal - amount;
        balances[token][to] = balances[token][to] + amount;
        
        //prevent accidentally sending to contract
        //while simultaneously support forwarding tokens to other contracts
        //without needing to "approve"
        uint length;
        assembly {
            //retrieve the size of the code on target address, this needs assembly
            length: = extcodesize(to)
        }
        if (length > 0) { // target is a contract, call required method
            YouStockReceiver(to).receiveYouStockTokens(token, msg.sender, amount);
        }
    }

    function createBuy(address token, uint64 amount, uint64 price) payable external returns(uint64 orderId) {
        require(msg.value == uint(amount) * price);
        orderId = latestOrderId++;
        buys[token][orderId] = Order(msg.sender, amount, price);
    }

    function fillBuy(address token, uint64 orderId, uint64 _amount) external {
        Order storage order = buys[token][orderId];
        uint64 amount;
        if(order.amount < _amount) {
            amount = order.amount;
        } else {
            amount = _amount;
        }
        
        uint64 balance = balances[token][msg.sender];
        if(balance < amount) {
            amount = balance;
        }
        
        uint size = uint(amount) * order.price;
        
        balances[token][msg.sender] = balance - amount;
        balances[token][order.owner] = balances[token][order.owner] + amount;
        msg.sender.transfer(size);

        order.amount = order.amount - amount;
    }

    function cancelBuy(address token, uint64 orderId) external {
        Order storage order = buys[token][orderId];
        require(order.owner == msg.sender);
        msg.sender.transfer(uint(order.amount) * order.price);
        order.amount = 0;
    }

    // creates a sell order
    function createSell(address token, uint64 amount, uint64 price) external returns(uint64 orderId) {
        //subtract token amount from user's balance
        uint64 balance = balances[token][msg.sender];
        require(balance >= amount);
        balances[token][msg.sender] = balance - amount;
        orderId = latestOrderId++;
        sells[token][orderId] = Order(msg.sender, amount, price);
    }

    function fillSell(address token, uint64 orderId, uint64 _amount) payable external {
        Order storage order = sells[token][orderId];

        uint64 amount;
        if(order.amount < _amount) {
            amount = order.amount;
        } else {
            amount = _amount;
        }
        
        require(amount != 0); //could save some gas in competitive scenarios
        
        uint size = uint(amount) * order.price;
        require(msg.value >= size);
        uint refund = msg.value - size;
        
        balances[token][msg.sender] = balances[token][msg.sender] + amount;
        order.owner.transfer(size);
        if(refund > 0) msg.sender.transfer(refund);

        order.amount = order.amount - amount;
    }

    function cancelSell(address token, uint64 orderId) external {
        Order storage order = sells[token][orderId];
        require(order.owner == msg.sender);
        balances[token][msg.sender] = balances[token][msg.sender] + order.amount;
        order.amount = 0;
    }
}

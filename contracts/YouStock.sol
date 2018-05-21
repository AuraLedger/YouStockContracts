pragma solidity ^0.4.22;

// YouStock is a self contained token factory and decentralized exchange
// as little data as needed is kept on chain 
// things like token name, decimals, ticker should be stored off chain
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
    
    event CreatedToken(address indexed token);
    event CreatedBuy(address indexed token, uint64 orderId, address owner, uint64 amount, uint64 price);
    event CreatedSell(address indexed token, uint64 orderId, address owner, uint64 amount, uint64 price);
    event FilledBuy(address indexed token, uint64 orderId, uint64 amount);
    event FilledSell(address indexed token, uint64 orderId, uint64 amount);
    event CancelledOrder(address indexed token, uint64 orderId);
    event Transfered(address indexed token, address indexed from, address indexed to, uint64 amount);
    
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
        emit CreatedToken(msg.sender);
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
        
        emit Transfered(token, msg.sender, to, amount);
    }

    function createBuy(address token, uint64 amount, uint64 price) payable external {
        require(msg.value == uint(amount) * price);
        latestOrderId++;
        buys[token][latestOrderId] = Order(msg.sender, amount, price);
        emit CreatedBuy(token, latestOrderId, msg.sender, amount, price);
    }

    function fillBuy(address token, uint64 orderId, uint64 _amount) external {
        Order storage order = buys[token][orderId];
        require(order.amount > 0);
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
        emit FilledBuy(token, orderId, amount);
    }

    function cancelBuy(address token, uint64 orderId) external {
        Order storage order = buys[token][orderId];
        require(order.owner == msg.sender);
        msg.sender.transfer(uint(order.amount) * order.price);
        order.amount = 0;
        emit CancelledOrder(token, orderId);
    }
    
    function batchSell(address token, uint64 _amount, uint64 price, uint64[] orderIds) external {
        uint64 remainingSellAmount = _amount;
        uint64 sellerBalance = balances[token][msg.sender];
        if(remainingSellAmount > sellerBalance)
            remainingSellAmount = sellerBalance;
            
        //deduct token balance from seller
        balances[token][msg.sender] = sellerBalance - remainingSellAmount;
            
        Order storage order;
        uint64 orderSellAmount;
        uint totalPayment = 0;
        for(uint i = 0; i < orderIds.length; i++)
        {
            if(remainingSellAmount == 0)
                break;
                
            order = buys[token][orderIds[i]];
            if(order.amount == 0)
                continue;
        
            if(order.amount < remainingSellAmount) {
                orderSellAmount = order.amount;
            } else {
                orderSellAmount = remainingSellAmount;
            }
        
            totalPayment += uint(orderSellAmount) * order.price;
        
            balances[token][order.owner] = balances[token][order.owner] + orderSellAmount;
            remainingSellAmount -= orderSellAmount;

            order.amount = order.amount - orderSellAmount;
            emit FilledBuy(token, orderIds[i], orderSellAmount);
        }
        
        //pay seller for filled orders
        if(totalPayment > 0)
            msg.sender.transfer(totalPayment);
        
        //create sell order with remaining amount
        if(remainingSellAmount > 0) {
            latestOrderId++;
            sells[token][latestOrderId] = Order(msg.sender, remainingSellAmount, price);
            emit CreatedSell(token, latestOrderId, msg.sender, remainingSellAmount, price);
        }
    }

    // creates a sell order
    function createSell(address token, uint64 amount, uint64 price) external {
        //subtract token amount from user's balance
        uint64 balance = balances[token][msg.sender];
        require(balance >= amount);
        balances[token][msg.sender] = balance - amount;
        latestOrderId++;
        sells[token][latestOrderId] = Order(msg.sender, amount, price);
        emit CreatedSell(token, latestOrderId, msg.sender, amount, price);
    }

    function fillSell(address token, uint64 orderId, uint64 _amount) payable external {
        Order storage order = sells[token][orderId];
        require(order.amount > 0);

        uint64 amount;
        if(order.amount < _amount) {
            amount = order.amount;
        } else {
            amount = _amount;
        }
        
        uint size = uint(amount) * order.price;
        require(msg.value >= size);
        uint refund = msg.value - size;
        
        balances[token][msg.sender] = balances[token][msg.sender] + amount;
        order.owner.transfer(size);
        if(refund > 0) msg.sender.transfer(refund);

        order.amount = order.amount - amount;
        emit FilledSell(token, orderId, amount);
    }

    function cancelSell(address token, uint64 orderId) external {
        Order storage order = sells[token][orderId];
        require(order.owner == msg.sender);
        balances[token][msg.sender] = balances[token][msg.sender] + order.amount;
        order.amount = 0;
        emit CancelledOrder(token, orderId);
    }

    function batchBuy(address token, uint64 price, uint64[] orderIds) payable external {
        uint remainingBuyMoney = msg.value;
            
        Order storage order;
        uint potentialAmount;
        uint64 orderBuyAmount;
        uint64 totalBought = 0;
        uint size;
        for(uint i = 0; i < orderIds.length; i++) {
            order = sells[token][orderIds[i]];
            if(order.amount == 0)
                continue;

            size = remainingBuyMoney;
            potentialAmount = remainingBuyMoney / order.price;
            if(potentialAmount > TOTAL_SUPPLY) {
                potentialAmount = TOTAL_SUPPLY;
                size = uint64(potentialAmount) * order.price;
            }
            orderBuyAmount = uint64(potentialAmount);
            if(order.amount < orderBuyAmount) {
                orderBuyAmount = order.amount;
                size = uint(orderBuyAmount) * order.price;
            }
            
            if(orderBuyAmount == 0)
                continue;
        
            totalBought += orderBuyAmount;
            order.owner.transfer(size);
            remainingBuyMoney -= size;

            order.amount = order.amount - orderBuyAmount;
            emit FilledSell(token, orderIds[i], orderBuyAmount);
            
            if(remainingBuyMoney == 0)
                break;
        }
        
        if(totalBought > 0)
            balances[token][msg.sender] += totalBought;
            
        if(remainingBuyMoney > 0) {
            potentialAmount = remainingBuyMoney / price;
            if(potentialAmount > TOTAL_SUPPLY) {
                potentialAmount = TOTAL_SUPPLY;
                msg.sender.transfer(remainingBuyMoney - (potentialAmount * price));
            }
            if(potentialAmount > 0) {
                orderBuyAmount = uint64(potentialAmount);
                latestOrderId++;
                buys[token][latestOrderId] = Order(msg.sender, orderBuyAmount, price);
                emit CreatedBuy(token, latestOrderId, msg.sender, orderBuyAmount, price);
            }
        }
    }
    
    function buyOwner(address token, uint64 orderId) public view returns (address owner) {
        owner = buys[token][orderId].owner;
    }
    
    function sellOwner(address token, uint64 orderId) public view returns (address owner) {
        owner = sells[token][orderId].owner;
    }
    
    function batchBuyInfo(address token, uint64[] orderIds) public view returns (uint64[] amounts, uint64[] prices, address[] owners) {
        for(uint i = 0; i < orderIds.length; i++)
        {
            amounts[i] = buys[token][orderIds[i]].amount;
            prices[i] = buys[token][orderIds[i]].price;
            owners[i] = buys[token][orderIds[i]].owner;
        }
    }
    
    function batchSellInfo(address token, uint64[] orderIds) public view returns (uint64[] amounts, uint64[] prices, address[] owners) {
        for(uint i = 0; i < orderIds.length; i++)
        {
            amounts[i] = sells[token][orderIds[i]].amount;
            prices[i] = sells[token][orderIds[i]].price;
            owners[i] = sells[token][orderIds[i]].owner;
        }
    }
}


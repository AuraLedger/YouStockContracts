var YouStockToken = artifacts.require("./YouStockToken.sol");
var YouStockExchange = artifacts.require("./YouStockExchange.sol");

var Fraction = require('fractional').Fraction

contract("YouStockToken", function(accounts) {
  it("...is transferable between accounts", async () => {
    const tkn = await YouStockToken.deployed();

    await tkn.transfer(accounts[1], 20);
    let received = await tkn.balanceOf(accounts[1]);

    assert.equal(received.c[0], 20, "accounts[1] should have received 0.00020 YST")

    await tkn.transfer(accounts[0], 20, {from: accounts[1]});
    let remains = await tkn.balanceOf(accounts[1]);
    assert.equal(remains.c[0], 0, "accounts[1] should have 0 YST remaining")
  });
});


contract("YouStockExchange", function(accounts) {
  function assertJump(error) {
    let revertOrInvalid = error.message.search('invalid opcode|revert')
    assert.isAbove(revertOrInvalid, -1, 'Invalid opcode error must be returned');
  }

  it("Can receive and redeem YST tokens", async () => {
    const yst = await YouStockToken.deployed();
    const youStockExchange = await YouStockExchange.deployed();

    await yst.transfer(youStockExchange.address, 1234);

    let transferred = await yst.totalSupply() - await yst.balanceOf(accounts[0]);
    assert.equal(transferred, 1234, "should have transferred 0.1234 YST");

    let received = await youStockExchange.balanceOf(yst.address, accounts[0]);
    assert.equal(transferred, received, "Should have received the same amount as transferred");

    await youStockExchange.redeem(yst.address, 1200);
    let remaining = await youStockExchange.balanceOf(yst.address, accounts[0]);
    assert.equal(remaining.c[0], 34, "Should have exactly 0.0034 STN remaining");

    try {
      await youStockExchange.redeem(yst.address, 500);
      assert.fail('Impossible to redeem tokens you dont own!');
    } catch(error) {
      assertJump(error);
    }

    await youStockExchange.redeem(yst.address, 34);
    remaining = await youStockExchange.balanceOf(yst.address, accounts[0]);
    assert.equal(remaining.c[0], 0, "Should have exactly 0.0000 STN remaining");
  });

  it("Can receive and redeem ether", async () => {
    const yst = await YouStockToken.deployed();
    const youStockExchange = await YouStockExchange.deployed();

    await youStockExchange.fund({from: accounts[0], value: 42});
    let received = await youStockExchange.balanceOf(0x0, accounts[0]);
    assert.equal(received.c[0], 42, "should have transferred 42 wei");

    await youStockExchange.redeem(0x0, 20);
    let remaining = await youStockExchange.balanceOf(0x0, accounts[0]);
    assert.equal(remaining.c[0], 22, "Should have exactly 22 wei remaining");

    try {
      await youStockExchange.redeem(0x0, 500);
      assert.fail('Impossible to redeem ether you dont own!');
    } catch(error) {
      assertJump(error);
    }

    await youStockExchange.redeem(0x0, 22);
    remaining = await youStockExchange.balanceOf(0x0, accounts[0]);
    assert.equal(remaining.c[0], 0, "Should have exactly 0 wei remaining");
  });

  it("Prevents other users from stealing your funds", async () => {
    const yst = await YouStockToken.deployed();
    const youStockExchange = await YouStockExchange.deployed();

    await youStockExchange.fund({from: accounts[0], value: 42});
    let ethreceived = await youStockExchange.balanceOf(0x0, accounts[0]);
    assert.equal(ethreceived.c[0], 42, "should have transferred 42 wei");

    await yst.transfer(youStockExchange.address, 1234);
    let ystreceived = await youStockExchange.balanceOf(yst.address, accounts[0]);
    assert.equal(ystreceived, 1234, "Should have received the same amount as transferred");

    try {
      await youStockExchange.redeem(0x0, 1, {from: accounts[1]});
      assert.fail('Impossible to redeem ether you dont own!');
    } catch(error) {
      assertJump(error);
    }

    try {
      await youStockExchange.redeem(yst.address, 1, {from: accounts[1]});
      assert.fail('Impossible to redeem tokens you dont own!');
    } catch(error) {
      assertJump(error);
    }

    await youStockExchange.redeem(0x0, 42);
    await youStockExchange.redeem(yst.address, 1234);

    let ethremaining = await youStockExchange.balanceOf(0x0, accounts[0]);
    assert.equal(ethremaining.c[0], 0, "Should have exactly 0 wei remaining");

    let ystremaining = await youStockExchange.balanceOf(yst.address, accounts[0]);
    assert.equal(ystremaining.c[0], 0, "Should have exactly 0.0000 STN remaining");
  });

  it("Can't create orders until you fund your balance", async () => {
    const yst = await YouStockToken.deployed();
    const youStockExchange = await YouStockExchange.deployed();

    try {
      let order = await youStockExchange.createOrder(yst.address, 0x0, 10, 11, 12);
      assert.fail('You need to fund your account first!');
    } catch(error) {
      assertJump(error);
    }
  });

  it("Can create and cancel orders", async () => {
    const yst = await YouStockToken.deployed();
    const youStockExchange = await YouStockExchange.deployed();

    const etherDecimals = 18;
    const ystDecimals   = 4;
    const desiredPrice  = 1.1; // 1.1 ETH for 1 STN

    await yst.transfer(youStockExchange.address, 12000); // deposit 1.2 STN

    var price = new Fraction(10**(etherDecimals - ystDecimals) * desiredPrice);

    let firstorder = await youStockExchange.createOrder(yst.address, 0x0, 10000, price.numerator, price.denominator);
    let firstOrderId = parseInt(firstorder.logs[0].args._id.toString());

    try {
      let order = await youStockExchange.createOrder(yst.address, 0x0, 10000, price.numerator, price.denominator);
      assert.fail('Not enough funds for another order!');
    } catch(error) {
      assertJump(error);
    }

    let secondorder = await youStockExchange.createOrder(yst.address, 0x0, 2000, price.numerator, price.denominator);
    let secondOrderId = parseInt(secondorder.logs[0].args._id.toString());

    assert.equal(firstOrderId + 1, secondOrderId);

    try {
      await youStockExchange.redeem(yst.address, 1);
      assert.fail('Impossible to redeem tokens that are currently used for active orders.');
    } catch(error) {
      assertJump(error);
    }

    await youStockExchange.cancelOrder(secondOrderId);
    await youStockExchange.redeem(yst.address, 2000);

    await youStockExchange.cancelOrder(firstOrderId);
    await youStockExchange.redeem(yst.address, 10000);

    remaining = await youStockExchange.balanceOf(yst.address, accounts[0]);
    assert.equal(remaining.c[0], 0, "Should have exactly 0.0000 STN remaining");
  });

  it("Prevents other people from cancelling your orders", async () => {
    const stn = await YouStockToken.deployed();
    const youStockExchange = await YouStockExchange.deployed();

    await stn.transfer(youStockExchange.address, 1234);
    let firstorder = await youStockExchange.createOrder(stn.address, 0x0, 1000, 1, 1); // exchange one wei to one miniSTN
    let firstOrderId = parseInt(firstorder.logs[0].args._id.toString());

    try {
      await youStockExchange.cancelOrder(firstOrderId, {from: accounts[1]});
      assert.fail('Impossible to cancel an order you dont own!');
    } catch(error) {
      assertJump(error);
    }

    await youStockExchange.cancelOrder(firstOrderId, {from: accounts[0]});
    await youStockExchange.redeem(stn.address, 1234);

    remaining = await youStockExchange.balanceOf(stn.address, accounts[0]);
    assert.equal(remaining.c[0], 0, "Should have exactly 0.0000 STN remaining");
  });

  it("Allows to trade tokens for ETH", async () => {
    const stn = await YouStockToken.deployed();
    const youStockExchange = await YouStockExchange.deployed();

    const etherDecimals = 18;
    const stnDecimals   = 4;
    const desiredPrice  = 1.1; // 1.1 ETH for 1 STN

    await stn.transfer(youStockExchange.address, 10000);
    await youStockExchange.fund({from: accounts[1], value: 11 * 10**(etherDecimals - 1)});

    let initialEtherBalance  = await youStockExchange.balanceOf(0x0, accounts[1]);
    assert.equal(web3.fromWei(initialEtherBalance.toString()), 1.1, "Has 1.1 ETH available for trade")

    // important to keep things integer
    // otherwise weird floating point rounding errors may creep up
    // for example, this won't work
    // var price = new Fraction(10**(etherDecimals - stnDecimals) * 1.1);
    // because in javascript, 10**(etherDecimals - stnDecimals) * 1.1 = 110000000000000.02
    var price = new Fraction(10**(etherDecimals - stnDecimals - 1) * 11);
    let order = await youStockExchange.createOrder(stn.address, 0x0, 10000, price.numerator, price.denominator);
    let trade = await youStockExchange.executeOrder(order.logs[0].args._id.toString(), 10000, {from: accounts[1]});

    let remainingTokensFirst  = await youStockExchange.balanceOf(stn.address, accounts[0]);
    let remainingTokensSecond = await youStockExchange.balanceOf(stn.address, accounts[1]);
    let remainingEtherFirst   = await youStockExchange.balanceOf(0x0, accounts[0]);
    let remainingEtherSecond  = await youStockExchange.balanceOf(0x0, accounts[1]);

    assert.equal(remainingTokensFirst.toString(), '10', "Should have exactly 0.0010 STN remaining");
    assert.equal(remainingTokensSecond.toString(), '9990', "Should have exactly 0.999 STN remaining");
    assert.equal(remainingEtherSecond.toString(), '0', "Should have exactly 0 ETH remaining");
    assert.equal(remainingEtherFirst.toString(), '1100000000000000000', "Should have exactly 1.1 ETH remaining");

    await youStockExchange.redeem(stn.address, 10);
    await youStockExchange.redeem(0x0, 1100000000000000000);
    await youStockExchange.redeem(stn.address, 9990, {from: accounts[1]});

    remainingTokensFirst  = await youStockExchange.balanceOf(stn.address, accounts[0]);
    remainingTokensSecond = await youStockExchange.balanceOf(stn.address, accounts[1]);
    remainingEtherFirst   = await youStockExchange.balanceOf(0x0, accounts[0]);
    remainingEtherSecond  = await youStockExchange.balanceOf(0x0, accounts[1]);

    assert.equal(remainingTokensFirst.toString(), '0', "Should have exactly 0 STN remaining");
    assert.equal(remainingTokensSecond.toString(), '0', "Should have exactly 0 STN remaining");
    assert.equal(remainingEtherSecond.toString(), '0', "Should have exactly 0 ETH remaining");
    assert.equal(remainingEtherFirst.toString(), '0', "Should have exactly 0 ETH remaining");
  });

  it("Allows to trade ETH for tokens", async () => {
    const stn = await YouStockToken.deployed();
    const youStockExchange = await YouStockExchange.deployed();

    const etherDecimals = 18;
    const stnDecimals   = 4;
    const desiredPrice  = 1.1; // 1.1 ETH for 1 STN

    let etherAmount = 11 * 10**(etherDecimals - 1);

    await stn.transfer(youStockExchange.address, 10000);
    await youStockExchange.fund({from: accounts[1], value: etherAmount});

    // for a trade in another direction we just flip the numerator and denominator
    // i.e. if 2 * x = y, then x = y * 1/2
    var price = new Fraction(1, 10**(etherDecimals - stnDecimals - 1) * 11);
    let order = await youStockExchange.createOrder(0x0, stn.address, etherAmount, price.numerator, price.denominator, {from: accounts[1]});
    let trade = await youStockExchange.executeOrder(order.logs[0].args._id.toString(), etherAmount);

    // fee = floor(1234 / 1000) = 1 STN
    // goes back to market maker
    let remainingTokensFirst  = await youStockExchange.balanceOf(stn.address, accounts[0]);
    let remainingTokensSecond = await youStockExchange.balanceOf(stn.address, accounts[1]);
    let remainingEtherFirst   = await youStockExchange.balanceOf(0x0, accounts[0]);
    let remainingEtherSecond  = await youStockExchange.balanceOf(0x0, accounts[1]);

    assert.equal(remainingTokensFirst.toString(), '0', "Should have exactly 0 STN remaining");
    assert.equal(remainingTokensSecond.toString(), '10000', "Should have exactly 1 STN remaining");
    assert.equal(remainingEtherSecond.toString(), '1100000000000000', "Should have exactly 0.0011 ETH remaining");
    assert.equal(remainingEtherFirst.toString(), '1098900000000000000', "Should have exactly 1.0989 ETH remaining");

    await youStockExchange.redeem(stn.address, 10000, {from: accounts[1]});
    await youStockExchange.redeem(0x0, 1100000000000000, {from: accounts[1]});
    await youStockExchange.redeem(0x0, 1098900000000000000);

    remainingTokensFirst  = await youStockExchange.balanceOf(stn.address, accounts[0]);
    remainingTokensSecond = await youStockExchange.balanceOf(stn.address, accounts[1]);
    remainingEtherFirst   = await youStockExchange.balanceOf(0x0, accounts[0]);
    remainingEtherSecond  = await youStockExchange.balanceOf(0x0, accounts[1]);

    assert.equal(remainingTokensFirst.toString(), '0', "Should have exactly 0 STN remaining");
    assert.equal(remainingTokensSecond.toString(), '0', "Should have exactly 0 STN remaining");
    assert.equal(remainingEtherSecond.toString(), '0', "Should have exactly 0 ETH remaining");
    assert.equal(remainingEtherFirst.toString(), '0', "Should have exactly 0 ETH remaining");
  });

  it("Allows to trade tokens for other tokens", async () => {
    const stn   = await YouStockToken.deployed();
    const ant   = await YouStockToken.deployed();
    const youStockExchange = await YouStockExchange.deployed();

    const antDecimals  = 6;
    const stnDecimals  = 4;
    const desiredPrice = 7.86; // 7.86632 ANT for 1 STN

    // give second account some ANT to play with
    await ant.transfer(accounts[1], 50000000);

    await stn.transfer(youStockExchange.address, 10000);
    await ant.transfer(youStockExchange.address, 7860000, {from: accounts[1]});

    let initialEtherBalance  = await youStockExchange.balanceOf(ant.address, accounts[1]);
    assert.equal(initialEtherBalance.toString(), desiredPrice*(10**antDecimals), "Has the right amount of ANT for trade")


    var price = new Fraction(10**(antDecimals - stnDecimals) * desiredPrice);
    let order = await youStockExchange.createOrder(stn.address, ant.address, 10000, price.numerator, price.denominator);
    let trade = await youStockExchange.executeOrder(order.logs[0].args._id.toString(), 10000, {from: accounts[1]});

    let remainingTokensFirst  = await youStockExchange.balanceOf(stn.address, accounts[0]);
    let remainingTokensSecond = await youStockExchange.balanceOf(stn.address, accounts[1]);
    let remainingEtherFirst   = await youStockExchange.balanceOf(ant.address, accounts[0]);
    let remainingEtherSecond  = await youStockExchange.balanceOf(ant.address, accounts[1]);

    assert.equal(remainingTokensFirst.toString(), '10', "Should have exactly 0.0010 STN remaining");
    assert.equal(remainingTokensSecond.toString(), '9990', "Should have exactly 0.999 STN remaining");
    assert.equal(remainingEtherSecond.toString(), '0', "Should have exactly 0 ANT remaining");
    assert.equal(remainingEtherFirst.toString(), '7860000', "Should have exactly 7.86 ANT remaining");

    await youStockExchange.redeem(stn.address, 10);
    await youStockExchange.redeem(ant.address, 7860000);
    await youStockExchange.redeem(stn.address, 9990, {from: accounts[1]});

    remainingTokensFirst  = await youStockExchange.balanceOf(stn.address, accounts[0]);
    remainingTokensSecond = await youStockExchange.balanceOf(stn.address, accounts[1]);
    remainingEtherFirst   = await youStockExchange.balanceOf(0x0, accounts[0]);
    remainingEtherSecond  = await youStockExchange.balanceOf(0x0, accounts[1]);

    assert.equal(remainingTokensFirst.toString(), '0', "Should have exactly 0 STN remaining");
    assert.equal(remainingTokensSecond.toString(), '0', "Should have exactly 0 STN remaining");
    assert.equal(remainingEtherSecond.toString(), '0', "Should have exactly 0 ETH remaining");
    assert.equal(remainingEtherFirst.toString(), '0', "Should have exactly 0 ETH remaining");
  });

  it("Makes sure that you have enough ether to fulfill the order", async () => {
    const stn = await YouStockToken.deployed();
    const youStockExchange = await YouStockExchange.deployed();

    await stn.transfer(youStockExchange.address, 1234);
    let order = await youStockExchange.createOrder(stn.address, 0x0, 1234, 1000000, 1);

    try {
      let trade = await youStockExchange.executeOrder(order.logs[0].args._id.toString(), 1234, {from: accounts[1]});
      assert.fail('Not enough Ether!');
    } catch(error) {
      assertJump(error);
    }

    await youStockExchange.cancelOrder(parseInt(order.logs[0].args._id.toString()));
    await youStockExchange.redeem(stn.address, 1234);
  });

  it("Makes sure that you have enough tokens to fulfill the order", async () => {
    const stn = await YouStockToken.deployed();
    const youStockExchange = await YouStockExchange.deployed();

    await youStockExchange.fund({value: 12345678});
    let order = await youStockExchange.createOrder(0x0, stn.address, 12345678, 1, 1);
    let orderId = parseInt(order.logs[0].args._id.toString());

    try {
      let trade = await youStockExchange.executeOrder(orderId, 12345678, {from: accounts[1]});
      assert.fail('Not enough STN!');
    } catch(error) {
      assertJump(error);
    }

    await youStockExchange.cancelOrder(orderId);
    await youStockExchange.redeem(0x0, 12345678);
  });

  it("Can't trade against an order that doesn't have enough capacity", async () => {
    const stn = await YouStockToken.deployed();
    const youStockExchange = await YouStockExchange.deployed();

    await youStockExchange.fund({value: 1234000000});
    let order = await youStockExchange.createOrder(0x0, stn.address, 1234, 1000000, 1);
    let orderId = parseInt(order.logs[0].args._id.toString());

    try {
      let trade = await youStockExchange.executeOrder(orderId, 9000);
      assert.fail('The order cannot handle this amount!');
    } catch(error) {
      assertJump(error);
    }

    await youStockExchange.cancelOrder(orderId);
    await youStockExchange.redeem(0x0, 1234000000);
  });

  it("Tracks balance of active orders in commitments", async () => {
    const stn = await YouStockToken.deployed();
    const youStockExchange = await YouStockExchange.deployed();

    await youStockExchange.fund({value: 1234});

    let balance = await youStockExchange.balanceOf(0x0, accounts[0]);
    let commitment = await youStockExchange.commitmentsOf(0x0, accounts[0]);

    assert.equal(balance.c[0], 1234, "Should have exactly 1234 wei remaining balance");
    assert.equal(commitment.c[0], 0, "Should have exactly 0 wei in commitments");

    let order = await youStockExchange.createOrder(0x0, stn.address, 1234, 10, 1);
    let orderId = parseInt(order.logs[0].args._id.toString());

    balance = await youStockExchange.balanceOf(0x0, accounts[0]);
    commitment = await youStockExchange.commitmentsOf(0x0, accounts[0]);

    assert.equal(balance.c[0], 0, "Should have exactly 0 wei remaining balance");
    assert.equal(commitment.c[0], 1234, "Should have exactly 1234 wei in commitments");

    await youStockExchange.cancelOrder(orderId);
    await youStockExchange.redeem(0x0, 1234);

    balance = await youStockExchange.balanceOf(0x0, accounts[0]);
    commitment = await youStockExchange.commitmentsOf(0x0, accounts[0]);

    assert.equal(balance.c[0], 0, "Should have exactly 0 wei remaining balance");
    assert.equal(commitment.c[0], 0, "Should have exactly 0 wei in commitments");
  });

  it("Can trade against an order until the funds run out", async () => {
    const stn = await YouStockToken.deployed();
    const youStockExchange = await YouStockExchange.deployed();

    await youStockExchange.fund({value: 1234, from: accounts[1]});
    await stn.transfer(youStockExchange.address, 1234);

    let balanceTrader = await youStockExchange.balanceOf(stn.address, accounts[0]);
    let balance = await youStockExchange.balanceOf(0x0, accounts[1]);
    let commitment = await youStockExchange.commitmentsOf(0x0, accounts[1]);

    assert.equal(balance.c[0], 1234, "Should have exactly 1234 wei remaining balance");
    assert.equal(commitment.c[0], 0, "Should have exactly 0 wei in commitments");
    assert.equal(balanceTrader.c[0], 1234, "Should have exactly 0.1234 STN remaining balance");

    let order = await youStockExchange.createOrder(0x0, stn.address, 1234, 1, 1, {from: accounts[1]});
    let orderId = parseInt(order.logs[0].args._id.toString());

    let trade = await youStockExchange.executeOrder(orderId, 1200);

    balance = await youStockExchange.balanceOf(0x0, accounts[1]);
    commitment = await youStockExchange.commitmentsOf(0x0, accounts[1]);
    balanceTrader = await youStockExchange.balanceOf(stn.address, accounts[0]);

    assert.equal(balance.c[0], 1, "Should have exactly 1 wei remaining balance");
    assert.equal(commitment.c[0], 34, "Should have exactly 0 wei in commitments");
    assert.equal(balanceTrader.c[0], 34, "Should have exactly 0.0034 STN remaining balance");

    trade = await youStockExchange.executeOrder(orderId, 34);

    balance = await youStockExchange.balanceOf(0x0, accounts[1]);
    commitment = await youStockExchange.commitmentsOf(0x0, accounts[1]);
    balanceTrader = await youStockExchange.balanceOf(stn.address, accounts[0]);

    assert.equal(balance.c[0], 1, "Should have exactly 1 wei remaining balance");
    assert.equal(commitment.c[0], 0, "Should have exactly 0 wei in commitments");
    assert.equal(balanceTrader.c[0], 0, "Should have exactly 0.0034 STN remaining balance");

    await youStockExchange.redeem(0x0, 1, {from: accounts[1]});
    await youStockExchange.redeem(stn.address, 1234, {from: accounts[1]});
    await youStockExchange.redeem(0x0, 1233);

    let remainingTokensFirst  = await youStockExchange.balanceOf(stn.address, accounts[0]);
    let remainingTokensSecond = await youStockExchange.balanceOf(stn.address, accounts[1]);
    let remainingEtherFirst   = await youStockExchange.balanceOf(0x0, accounts[0]);
    let remainingEtherSecond  = await youStockExchange.balanceOf(0x0, accounts[1]);

    assert.equal(remainingTokensFirst.c[0], 0, "Should have exactly 0 STN remaining");
    assert.equal(remainingTokensSecond.c[0], 0, "Should have exactly 0 STN remaining");
    assert.equal(remainingEtherSecond.c[0], 0, "Should have exactly 0 ether remaining");
    assert.equal(remainingEtherFirst.c[0], 0, "Should have exactly 0 ether remaining");
  });

  it("Cannot create an order that trades a token for itself", async () => {
    const stn = await YouStockToken.deployed();
    const youStockExchange = await YouStockExchange.deployed();

    await stn.transfer(youStockExchange.address, 1234);

    try {
      let order = await youStockExchange.createOrder(stn.address, stn.address, 1234, 1, 1);
      assert.fail('Cannot trade a token for itself!');
    } catch(error) {
      assertJump(error);
    }

    await youStockExchange.redeem(stn.address, 1234);
  });

  it("Cannot execute an order that never existed", async () => {
    const stn = await YouStockToken.deployed();
    const youStockExchange = await YouStockExchange.deployed();

    await stn.transfer(youStockExchange.address, 1234);
    let order = await youStockExchange.createOrder(stn.address, 0x0, 1234, 1, 1);
    let orderId = parseInt(order.logs[0].args._id.toString());

    try {
      await youStockExchange.executeOrder(orderId + 2, 1234, {from: accounts[1]});
      assert.fail('Cannot trade against an order that never existed!');
    } catch(error) {
      assertJump(error);
    }

    await youStockExchange.cancelOrder(orderId);
    await youStockExchange.redeem(stn.address, 1234);
  });

  it("Cannot create an order that trades for 0 tokens", async () => {
    const stn = await YouStockToken.deployed();
    const youStockExchange = await YouStockExchange.deployed();

    await stn.transfer(youStockExchange.address, 1234);

    try {
      await youStockExchange.createOrder(stn.address, 0x0, 1234, 1, 100000);
      assert.fail('Cannot trade against an order that never existed!');
    } catch(error) {
      assertJump(error);
    }

    await youStockExchange.redeem(stn.address, 1234);
  });

  it("Cannot cancel an order that has been fulfilled", async () => {
    const stn = await YouStockToken.deployed();
    const youStockExchange = await YouStockExchange.deployed();

    await stn.transfer(youStockExchange.address, 1234);
    await youStockExchange.fund({value: 1234, from: accounts[1]});
    let order = await youStockExchange.createOrder(stn.address, 0x0, 1234, 1, 1);
    let orderId = parseInt(order.logs[0].args._id.toString());
    let trade = await youStockExchange.executeOrder(orderId, 1234, {from: accounts[1]});

    try {
      await youStockExchange.cancelOrder(orderId);
      assert.fail('What is dead cannot be killed!');
    } catch(error) {
      assertJump(error);
    }

    await youStockExchange.redeem(0x0, 1234);
    await youStockExchange.redeem(stn.address, 1233, {from: accounts[1]});
    await youStockExchange.redeem(stn.address, 1);
  });

  it("Does not let you trade against yourself", async () => {
    const stn = await YouStockToken.deployed();
    const youStockExchange = await YouStockExchange.deployed();

    await stn.transfer(youStockExchange.address, 1234);
    await youStockExchange.fund({value: 1234});
    let order = await youStockExchange.createOrder(stn.address, 0x0, 1234, 1, 1);
    let orderId = parseInt(order.logs[0].args._id.toString());

    try {
      let trade = await youStockExchange.executeOrder(orderId, 1234);
      assert.fail('Do not trade against yourself!');
    } catch(error) {
      assertJump(error);
    }

    await youStockExchange.cancelOrder(orderId);

    await youStockExchange.redeem(0x0, 1234);
    await youStockExchange.redeem(stn.address, 1234);
  });

  it("Prevents trade spam with zero value", async () => {
    const stn = await YouStockToken.deployed();
    const youStockExchange = await YouStockExchange.deployed();

    await stn.transfer(youStockExchange.address, 1234);
    await youStockExchange.fund({value: 1234, from: accounts[1]});
    let order = await youStockExchange.createOrder(stn.address, 0x0, 1234, 1, 1);
    let orderId = parseInt(order.logs[0].args._id.toString());

    try {
      let trade = await youStockExchange.executeOrder(orderId, 0, {from: accounts[1]});
      assert.fail('Cannot execute an order with 0 amount!');
    } catch(error) {
      assertJump(error);
    }

    await youStockExchange.cancelOrder(orderId);

    await youStockExchange.redeem(stn.address, 1234);
    await youStockExchange.redeem(0x0, 1234, {from: accounts[1]});
  });

  it("Prevents creating orders with 0 amount or price", async () => {
    const stn = await YouStockToken.deployed();
    const youStockExchange = await YouStockExchange.deployed();

    await stn.transfer(youStockExchange.address, 1234);

    try {
      let order = await youStockExchange.createOrder(stn.address, 0x0, 0, 1, 1);
      assert.fail('Order amount cannot be zero!');
    } catch(error) {
      assertJump(error);
    }

    try {
      let order = await youStockExchange.createOrder(stn.address, 0x0, 1234, 0, 1);
      assert.fail('Order price cannot be zero!');
    } catch(error) {
      assertJump(error);
    }

    try {
      let order = await youStockExchange.createOrder(stn.address, 0x0, 1234, 1, 0);
      assert.fail('Order price cannot be infinity!');
    } catch(error) {
      assertJump(error);
    }

    await youStockExchange.redeem(stn.address, 1234);
  });

  it("Cannot redeem nothing", async () => {
    const stn = await YouStockToken.deployed();
    const youStockExchange = await YouStockExchange.deployed();

    await stn.transfer(youStockExchange.address, 1234);

    try {
      await youStockExchange.redeem(stn.address, 0);
      assert.fail('redeeming 0 tokens is pointless!');
    } catch(error) {
      assertJump(error);
    }

    await youStockExchange.redeem(stn.address, 1234);
  });
});

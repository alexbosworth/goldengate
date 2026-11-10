const {createHash} = require('node:crypto');
const {deepEqual} = require('node:assert').strict;
const {equal} = require('node:assert').strict;
const {randomBytes} = require('node:crypto');
const {rejects} = require('node:assert').strict;
const test = require('node:test');

const asyncRetry = require('async/retry');
const {getChainTransactions} = require('ln-service');
const {getHeight} = require('ln-service');
const {getInvoice} = require('ln-service');
const {parsePaymentRequest} = require('ln-service');
const {pay} = require('ln-service');
const {setupChannel} = require('ln-docker-daemons');
const {spawnLightningCluster} = require('ln-docker-daemons');

const {cancelSwapOut} = require('./../../');
const {createLegacySwapOut} = require('./../../');
const {createSwapOut} = require('./../../');
const {findDeposit} = require('./../../');
const {lightningLabsSwapAuth} = require('./../../');
const {lightningLabsSwapService} = require('./../../');
const {makePrivateKey} = require('./../../script');
const {subscribeToSwapOutStatus} = require('./../../');
const swapKey = require('./../../script/get_public_key');
const {swapOutServer} = require('./../macros');
const {waitForSameChainTip} = require('./../macros');

const bufferAsHex = buffer => buffer.toString('hex');
const cancelRoute = 'INVOICE_ROUTE';
const channelCapacity = 2e6;
const cltvDelta = 100;
const deadlineState = 'SERVER_FAILED_SWAP_DEADLINE';
const depositTimeoutMs = 1000 * 60;
const family = 805;
const fundWindowMs = 1000 * 60 * 30;
const interval = 10;
const invalidAmountState = 'SERVER_FAILED_INVALID_HTLC_AMOUNT';
const macaroon = Buffer.from('macaroon').toString('base64');
const maturity = 100;
const missingTokens = 1000;
const musig2Version = 'MUSIG2';
const network = 'btcregtest';
const noDepositWaitMs = 1000 * 10;
const preimage = Buffer.alloc(32).toString('hex');
const prepayTokens = 3000;
const rejected = [503, 'PaymentRejectedByDestination'];
const sha256 = secret => createHash('sha256').update(secret).digest('hex');
const size = 2;
const swapFee = 1000;
const times = 2000;
const tokens = 250000;

// Find a deposit to an address, the result comes once the deposit confirms
const findDepositTo = args => {
  return new Promise((resolve, reject) => {
    return findDeposit(args, (err, res) => {
      return !!err ? reject(err) : resolve(res);
    });
  });
};

// Pay a request, the result comes once the payment settles or fails back
const payRequest = ({lnd, request}) => {
  return pay({lnd, request}).then(paid => ({paid}), err => ({err}));
};

// Wait for the service to hold a payment to one of its invoices
const waitForHeld = ({id, lnd}) => {
  return asyncRetry({interval, times}, async () => {
    const invoice = await getInvoice({id, lnd});

    if (!invoice.is_held) {
      throw new Error('ExpectedServiceToHoldPayment');
    }
  });
};

// Swap out payments fail back when the client cancels or nothing is published
test(`Swap out failures`, async () => {
  const {kill, nodes} = await spawnLightningCluster({size});

  const [client, server] = nodes;

  const lnds = [client.lnd, server.lnd];

  const swapServer = await swapOutServer({
    network,
    cltv_delta: cltvDelta,
    fee: swapFee,
    key_family: family,
    lnd: server.lnd,
    prepay: prepayTokens,
  });

  const {metadata} = lightningLabsSwapAuth({macaroon, preimage});

  const {service} = lightningLabsSwapService({
    network,
    cert: swapServer.cert,
    socket: swapServer.socket,
  });

  try {
    await server.generate({count: maturity});

    // The client mines its blocks on top of the service blocks
    await waitForSameChainTip({lnds});

    // The client pays for swaps with a channel to the service
    await setupChannel({
      capacity: channelCapacity,
      generate: client.generate,
      lnd: client.lnd,
      to: server,
    });

    // The service mines its blocks on top of the client blocks
    await waitForSameChainTip({lnds});

    const claimKey = makePrivateKey({}).private_key;
    const fundAt = new Date(Date.now() + fundWindowMs).toISOString();
    const height = await getHeight({lnd: client.lnd});
    const secret = randomBytes(32);

    const claimPublicKey = swapKey({private_key: claimKey}).public_key;
    const hash = sha256(secret);
    const timeout = height.current_block_height + cltvDelta;

    // The client makes a swap that it only pays the prepay of
    const canceled = await createLegacySwapOut({
      metadata,
      network,
      service,
      timeout,
      tokens,
    });

    const fund = parsePaymentRequest({request: canceled.swap_fund_request});

    const prepay = parsePaymentRequest({
      request: canceled.swap_execute_request,
    });

    const prepaying = payRequest({
      lnd: client.lnd,
      request: canceled.swap_execute_request,
    });

    // The service holds the prepay until the HTLC is published
    await waitForHeld({id: prepay.id, lnd: server.lnd});

    // A cancel without the payment address of the swap is refused
    await rejects(
      cancelSwapOut({
        metadata,
        service,
        id: fund.id,
        payment: bufferAsHex(randomBytes(32)),
      }),
      err => err[2].err.details === 'ExpectedPaymentAddressOfSwapToCancel',
      'Only a client with the swap invoice can cancel the swap'
    );

    const held = await getInvoice({id: prepay.id, lnd: server.lnd});

    equal(held.is_held, true, 'A refused cancel leaves the prepay held');

    // The client cannot pay the swap so it cancels the swap
    await cancelSwapOut({
      metadata,
      service,
      id: fund.id,
      payment: fund.payment,
    });

    const [cancel] = swapServer.requests.cancelLoopOutSwap.slice(-1);

    equal(cancel.protocol_version, musig2Version, 'Cancel is MuSig2');
    equal(cancel.route_cancel.route_type, cancelRoute, 'Swap was not paid');

    // The service fails the prepay back to the client
    const canceledPrepay = await prepaying;

    deepEqual(canceledPrepay.err, rejected, 'Prepay fails back to the client');

    const canceledFund = await getInvoice({id: fund.id, lnd: server.lnd});

    equal(canceledFund.is_canceled, true, 'The swap can no longer be paid');

    // The client makes a Taproot swap that the service does not publish
    const late = await createSwapOut({
      hash,
      metadata,
      network,
      service,
      timeout,
      tokens,
      fund_at: fundAt,
      public_key: claimPublicKey,
    });

    // The client gets the status of the swap as it changes
    const updates = [];

    const sub = subscribeToSwapOutStatus({metadata, service, id: hash});

    sub.on('status_update', update => updates.push(update));

    // Wait for the subscription to get the status of the new swap
    await asyncRetry({interval, times}, async () => {
      if (!updates.length) {
        throw new Error('ExpectedStatusOfNewSwap');
      }
    });

    const latePrepay = parsePaymentRequest({
      request: late.swap_execute_request,
    });

    // The client pays the prepay and the swap, the service holds both
    const latePrepaying = payRequest({
      lnd: client.lnd,
      request: late.swap_execute_request,
    });

    const latePaying = payRequest({
      lnd: client.lnd,
      request: late.swap_fund_request,
    });

    await waitForHeld({id: hash, lnd: server.lnd});
    await waitForHeld({id: latePrepay.id, lnd: server.lnd});

    // The service misses the deadline to publish the HTLC of the swap
    await swapServer.fail({id: hash, state: deadlineState});

    const [latePayment, lateDeposit] = await Promise.all([
      latePaying,
      latePrepaying,
    ]);

    deepEqual(latePayment.err, rejected, 'Swap payment fails back');
    deepEqual(lateDeposit.err, rejected, 'Prepay fails back');

    // The client sees the swap fail without an HTLC
    await asyncRetry({interval, times}, async () => {
      const [status] = updates.slice(-1);

      if (!status.is_failed) {
        throw new Error('ExpectedFailedSwapStatus');
      }
    });

    const [failed] = updates.slice(-1);

    equal(failed.is_broadcast, false, 'The service did not publish an HTLC');
    equal(failed.is_failed, true, 'The swap failed');

    // The client makes a swap that the service underpays on chain
    const short = await createLegacySwapOut({
      metadata,
      network,
      service,
      timeout,
      tokens,
    });

    const shortId = parsePaymentRequest({request: short.swap_fund_request}).id;
    const shortTokens = tokens - missingTokens;

    const shortPrepaying = payRequest({
      lnd: client.lnd,
      request: short.swap_execute_request,
    });

    const shortPaying = payRequest({
      lnd: client.lnd,
      request: short.swap_fund_request,
    });

    // The service publishes an HTLC that pays less than the swap tokens
    const shortHtlc = await asyncRetry({interval, times}, async () => {
      return await swapServer.publish({id: shortId, tokens: shortTokens});
    });

    // The service mines the HTLC into a block
    await server.generate({});

    await asyncRetry({interval, times}, async () => {
      const {transactions} = await getChainTransactions({lnd: server.lnd});

      const tx = transactions.find(n => n.id === shortHtlc.transaction_id);

      if (!tx || !tx.is_confirmed) {
        throw new Error('ExpectedUnderpaidHtlcConfirmed');
      }
    });

    // The client mines its blocks on top of the service blocks
    await waitForSameChainTip({lnds});

    const lookup = {
      network,
      address: short.address,
      after: height.current_block_height,
      confirmations: 1,
      lnd: client.lnd,
    };

    // The client sees the HTLC confirm with the tokens that it pays
    const underpaid = await findDepositTo({
      ...lookup,
      timeout: depositTimeoutMs,
      tokens: shortTokens,
    });

    equal(underpaid.transaction_id, shortHtlc.transaction_id, 'Got HTLC');

    // An HTLC that pays less than the swap tokens is not the swap deposit
    await rejects(
      findDepositTo({...lookup, tokens, timeout: noDepositWaitMs}),
      [503, 'FailedToFindDepositWithinTimeoutTime'],
      'The client does not take an underpaid HTLC as the swap HTLC'
    );

    // The service fails the swap, the swap payment fails back to the client
    await swapServer.fail({id: shortId, state: invalidAmountState});

    const [shortPayment, shortPrepay] = await Promise.all([
      shortPaying,
      shortPrepaying,
    ]);

    deepEqual(shortPayment.err, rejected, 'Swap payment fails back');
    equal(shortPrepay.paid.tokens, prepayTokens, 'Service keeps the prepay');
  } catch (err) {
    equal(err, null, 'Expected no error');
  } finally {
    service.close();

    swapServer.stop();

    await kill({});
  }

  return;
});

const {deepEqual} = require('node:assert').strict;
const {equal} = require('node:assert').strict;
const {rejects} = require('node:assert').strict;
const test = require('node:test');

const asyncRetry = require('async/retry');
const {componentsOfTransaction} = require('@alexbosworth/blockchain');
const {createChainAddress} = require('ln-service');
const {getChainTransactions} = require('ln-service');
const {getHeight} = require('ln-service');
const {getInvoice} = require('ln-service');
const {idForTransaction} = require('@alexbosworth/blockchain');
const {outputScriptForAddress} = require('@alexbosworth/blockchain');
const {parsePaymentRequest} = require('ln-service');
const {pay} = require('ln-service');
const {setupChannel} = require('ln-docker-daemons');
const {spawnLightningCluster} = require('ln-docker-daemons');

const {attemptSweep} = require('./../../');
const {createLegacySwapOut} = require('./../../');
const {lightningLabsSwapAuth} = require('./../../');
const {lightningLabsSwapService} = require('./../../');
const {subscribeToSpend} = require('./../../');
const {subscribeToSwapOutStatus} = require('./../../');
const {swapOutServer} = require('./../macros');
const {waitForSameChainTip} = require('./../macros');

const channelCapacity = 2e6;
const cltvDelta = 40;
const family = 805;
const feeRate = 2;
const idOf = request => parsePaymentRequest({request}).id;
const interval = 10;
const macaroon = Buffer.from('macaroon').toString('base64');
const maturity = 100;
const maxFeeMultiplier = 10;
const network = 'btcregtest';
const preimage = Buffer.alloc(32).toString('hex');
const prepayTokens = 3000;
const refundedState = 'SERVER_FAILED_TIMEOUT';
const rejected = [503, 'PaymentRejectedByDestination'];
const size = 2;
const swapFee = 1000;
const times = 2000;
const tokens = 250000;

// Errors of a broadcast that the chain backend refuses
const refusedBroadcasts = [
  'FailedToBroadcastRawTransaction',
  'UnexpectedErrBroadcastingRawTx',
];

// Swap status flags for published and refunded as the swap times out
const statusFlags = [
  [false, false],
  [true, false],
  [true, false],
  [true, true],
];

// The chain backend refused to take a transaction
const isRefused = err => refusedBroadcasts.includes(err[1]);

// Pay a request, the result comes once the payment settles or fails back
const payRequest = ({lnd, request}) => {
  return pay({lnd, request}).then(paid => ({paid}), err => ({err}));
};

// Pay the prepay and the swap of a swap, the service holds both payments
const paySwap = ({lnd, swap}) => {
  const prepaying = payRequest({lnd, request: swap.swap_execute_request});

  const paying = payRequest({lnd, request: swap.swap_fund_request});

  return {paying, prepaying};
};

// Wait for a watched HTLC to be spent, the spending transaction id comes back
const spendOf = async watch => {
  await asyncRetry({interval, times}, async () => {
    if (!watch.spends.length) {
      throw new Error('ExpectedHtlcSpend');
    }
  });

  const [transaction] = watch.spends;

  return idForTransaction({transaction}).id;
};

// Wait for an LND to see a transaction confirm, without mining more blocks
const waitForConfirmed = ({id, lnd}) => {
  return asyncRetry({interval, times}, async () => {
    const {transactions} = await getChainTransactions({lnd});

    const tx = transactions.find(n => n.id === id);

    if (!tx || !tx.is_confirmed) {
      throw new Error('ExpectedTransactionConfirmed');
    }
  });
};

// Wait for an LND to get the blocks up to a height
const waitForHeight = ({height, lnd}) => {
  return asyncRetry({interval, times}, async () => {
    const tip = await getHeight({lnd});

    if (tip.current_block_height < height) {
      throw new Error('ExpectedBlocksUpToHeight');
    }
  });
};

// Watch an HTLC for a confirmed spend, keeping the spends and errors seen
const watchHtlc = ({htlc, lnd, script, start}) => {
  const errors = [];
  const spends = [];

  const sub = subscribeToSpend({
    lnd,
    min_height: start,
    output_script: script,
    transaction_id: htlc.transaction_id,
    transaction_vout: htlc.transaction_vout,
  });

  sub.on('confirmation', ({transaction}) => spends.push(transaction));
  sub.on('error', err => errors.push(err));

  return {errors, spends, sub};
};

// A swap out claim that is too late loses the race to the refund
test(`Swap out claim and refund race`, async () => {
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

    const height = await getHeight({lnd: client.lnd});

    const timeout = height.current_block_height + cltvDelta;

    // The client makes two swaps that time out at the same height
    const claimed = await createLegacySwapOut({
      metadata,
      network,
      service,
      timeout,
      tokens,
    });

    const refunded = await createLegacySwapOut({
      metadata,
      network,
      service,
      timeout,
      tokens,
    });

    const claimedId = idOf(claimed.swap_fund_request);
    const refundedId = idOf(refunded.swap_fund_request);

    // The client gets the status of the swap that times out
    const updates = [];

    const sub = subscribeToSwapOutStatus({
      metadata,
      service,
      id: refundedId,
    });

    sub.on('status_update', update => updates.push(update));

    // Wait for the subscription to get the status of the new swap
    await asyncRetry({interval, times}, async () => {
      if (!updates.length) {
        throw new Error('ExpectedStatusOfNewSwap');
      }
    });

    // The client pays for both swaps, the service holds the payments
    const claimedPay = paySwap({lnd: client.lnd, swap: claimed});
    const refundedPay = paySwap({lnd: client.lnd, swap: refunded});

    // The service publishes the HTLCs once the payments are held
    const claimedHtlc = await asyncRetry({interval, times}, async () => {
      return await swapServer.publish({id: claimedId});
    });

    const refundedHtlc = await asyncRetry({interval, times}, async () => {
      return await swapServer.publish({id: refundedId});
    });

    // The service mines the HTLCs into a block
    await server.generate({});

    await waitForConfirmed({
      id: claimedHtlc.transaction_id,
      lnd: server.lnd,
    });

    await waitForConfirmed({
      id: refundedHtlc.transaction_id,
      lnd: server.lnd,
    });

    const confirmedAt = await getHeight({lnd: server.lnd});

    // The service mines up to one block before the refund path opens
    await server.generate({
      count: timeout - confirmedAt.current_block_height - 1,
    });

    await waitForHeight({height: timeout - 1, lnd: server.lnd});

    // The client mines its blocks on top of the service blocks
    await waitForSameChainTip({lnds});

    const refundAddress = await createChainAddress({lnd: server.lnd});
    const sweepAddress = await createChainAddress({lnd: client.lnd});
    const tip = await getHeight({lnd: client.lnd});

    equal(tip.current_block_height, timeout - 1, 'Refunds open next block');

    const claimedScript = outputScriptForAddress({
      network,
      address: claimed.address,
    });

    const refundedScript = outputScriptForAddress({
      network,
      address: refunded.address,
    });

    // The client watches its HTLCs to see which ones are spent by what
    const claimedWatch = watchHtlc({
      htlc: claimedHtlc,
      lnd: client.lnd,
      script: claimedScript.script,
      start: height.current_block_height,
    });

    const refundedWatch = watchHtlc({
      htlc: refundedHtlc,
      lnd: client.lnd,
      script: refundedScript.script,
      start: height.current_block_height,
    });

    // The service cannot refund before the timeout of the swaps
    await rejects(
      swapServer.refund({address: refundAddress.address, id: claimedId}),
      isRefused,
      'A refund is not final before the swap timeout'
    );

    await rejects(
      swapServer.refund({address: refundAddress.address, id: refundedId}),
      isRefused,
      'A refund is not final before the swap timeout'
    );

    // The service keeps holding the swap payments while it cannot refund
    const [claimedFund, refundedFund] = await Promise.all([
      getInvoice({id: claimedId, lnd: server.lnd}),
      getInvoice({id: refundedId, lnd: server.lnd}),
    ]);

    equal(claimedFund.is_held, true, 'The first swap payment is held');
    equal(refundedFund.is_held, true, 'The second swap payment is held');

    const claim = {
      network,
      tokens,
      current_height: tip.current_block_height,
      deadline_height: timeout,
      lnd: client.lnd,
      max_fee_multiplier: maxFeeMultiplier,
      min_fee_rate: feeRate,
      start_height: height.current_block_height,
      sweep_address: sweepAddress.address,
    };

    // The client claims the first swap just before the refund path opens
    const sweep = await attemptSweep({
      ...claim,
      private_key: claimed.private_key,
      secret: claimed.secret,
      transaction_id: claimedHtlc.transaction_id,
      transaction_vout: claimedHtlc.transaction_vout,
      witness_script: claimed.script,
    });

    const sweepId = idForTransaction({transaction: sweep.transaction}).id;

    // The claim confirms in the block that opens the refund path
    await client.generate({});

    await waitForConfirmed({id: sweepId, lnd: client.lnd});

    // The service mines its blocks on top of the client block
    await waitForSameChainTip({lnds});

    // The service cannot refund the swap that the client claimed
    await rejects(
      swapServer.refund({address: refundAddress.address, id: claimedId}),
      isRefused,
      'A claimed HTLC cannot be refunded'
    );

    // The service refunds the swap that the client did not claim in time
    const refund = await swapServer.refund({
      address: refundAddress.address,
      id: refundedId,
    });

    const refundTx = componentsOfTransaction({
      transaction: refund.transaction,
    });

    const [refundInput] = refundTx.inputs;

    equal(refundInput.id, refundedHtlc.transaction_id, 'Refund spends HTLC');
    equal(refundTx.locktime, timeout, 'Refund is locked to the timeout');

    const refundId = idForTransaction({transaction: refund.transaction}).id;

    // The service mines the refund
    await server.generate({});

    await waitForConfirmed({id: refundId, lnd: server.lnd});

    // The client mines its blocks on top of the service blocks
    await waitForSameChainTip({lnds});

    const lateTip = await getHeight({lnd: client.lnd});

    // The client cannot claim the swap that the service refunded
    await rejects(
      attemptSweep({
        ...claim,
        current_height: lateTip.current_block_height,
        private_key: refunded.private_key,
        secret: refunded.secret,
        transaction_id: refundedHtlc.transaction_id,
        transaction_vout: refundedHtlc.transaction_vout,
        witness_script: refunded.script,
      }),
      isRefused,
      'A claim after the refund is too late'
    );

    // The client sees its claim of one HTLC and the refund of the other
    const claimSpend = await spendOf(claimedWatch);
    const refundSpend = await spendOf(refundedWatch);

    claimedWatch.sub.removeAllListeners();
    refundedWatch.sub.removeAllListeners();

    const watchErrors = claimedWatch.errors.concat(refundedWatch.errors);

    deepEqual(watchErrors, [], 'No errors watching the HTLCs');
    equal(claimSpend, sweepId, 'The client sees its claim spend the HTLC');
    equal(refundSpend, refundId, 'The client sees the refund of the service');

    // The service gets the preimage from the claim and settles the payment
    await swapServer.settleFromClaim({
      id: claimedId,
      transaction: sweep.transaction,
    });

    const [claimedPayment, refundedPayment] = await Promise.all([
      claimedPay.paying,
      refundedPay.paying,
    ]);

    equal(claimedPayment.paid.secret, claimed.secret, 'Claimed swap is paid');
    deepEqual(refundedPayment.err, rejected, 'Refunded swap fails back');

    // The service keeps the prepay of the swap that it refunded
    const refundedPrepay = await refundedPay.prepaying;

    equal(refundedPrepay.paid.tokens, prepayTokens, 'Service keeps prepay');

    // The service tells the client that the refund is done
    swapServer.update({id: refundedId, state: refundedState});

    // Wait for the client to get the status updates of the swap
    await asyncRetry({interval, times}, async () => {
      if (updates.length < statusFlags.length) {
        throw new Error('ExpectedSwapStatusUpdates');
      }
    });

    deepEqual(
      updates.map(n => [n.is_broadcast, n.is_refunded]),
      statusFlags,
      'The client sees the swap start, publish, refund and get refunded'
    );
  } catch (err) {
    equal(err, null, 'Expected no error');
  } finally {
    service.close();

    swapServer.stop();

    await kill({});
  }

  return;
});

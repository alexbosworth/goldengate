const {createHash} = require('node:crypto');
const {deepEqual} = require('node:assert').strict;
const {equal} = require('node:assert').strict;
const {randomBytes} = require('node:crypto');
const {rejects} = require('node:assert').strict;
const test = require('node:test');

const asyncRetry = require('async/retry');
const {componentsOfTransaction} = require('@alexbosworth/blockchain');
const {createChainAddress} = require('ln-service');
const {getChainTransactions} = require('ln-service');
const {getHeight} = require('ln-service');
const {getInvoice} = require('ln-service');
const {idForTransaction} = require('@alexbosworth/blockchain');
const {pay} = require('ln-service');
const {setupChannel} = require('ln-docker-daemons');
const {spawnLightningCluster} = require('ln-docker-daemons');

const {attemptTaprootClaim} = require('./../../');
const {createSwapOut} = require('./../../');
const {findDeposit} = require('./../../');
const {lightningLabsSwapAuth} = require('./../../');
const {lightningLabsSwapService} = require('./../../');
const {makePrivateKey} = require('./../../script');
const {subscribeToSpend} = require('./../../');
const {subscribeToSwapOutStatus} = require('./../../');
const swapKey = require('./../../script/get_public_key');
const {swapOutServer} = require('./../macros');
const {taprootSwapOutHtlc} = require('./../macros');
const {waitForSameChainTip} = require('./../macros');

const bufferAsHex = buffer => buffer.toString('hex');
const channelCapacity = 2e6;
const cltvDelta = 40;
const depositTimeoutMs = 1000 * 60;
const family = 805;
const feeRate = 2;
const fundWindowMs = 1000 * 60 * 30;
const interval = 10;
const macaroon = Buffer.from('macaroon').toString('base64');
const maturity = 100;
const maxFeeMultiplier = 10;
const network = 'btcregtest';
const preimage = Buffer.alloc(32).toString('hex');
const prepayTokens = 3000;
const refundedState = 'SERVER_FAILED_TIMEOUT';
const rejected = [503, 'PaymentRejectedByDestination'];
const sha256 = secret => createHash('sha256').update(secret).digest('hex');
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

// The deposit that the client finds for an HTLC that pays the swap tokens
const depositOf = htlc => ({
  output_tokens: tokens,
  transaction_id: htlc.transaction_id,
  transaction_vout: htlc.transaction_vout,
});

// Find a deposit to an output script, the result comes once it confirms
const findDepositTo = args => {
  return new Promise((resolve, reject) => {
    return findDeposit(args, (err, res) => {
      return !!err ? reject(err) : resolve(res);
    });
  });
};

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

// A Taproot swap out claim that is too late loses the race to the refund
test(`Taproot swap out claim and refund race`, async () => {
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

    const claimPublicKey = swapKey({private_key: claimKey}).public_key;
    const timeout = height.current_block_height + cltvDelta;

    // Make a swap with an HTLC that the client can claim with its own key
    const makeSwap = async () => {
      const secret = randomBytes(32);

      const hash = sha256(secret);

      const swap = await createSwapOut({
        hash,
        metadata,
        network,
        service,
        timeout,
        tokens,
        fund_at: fundAt,
        public_key: claimPublicKey,
      });

      const htlc = taprootSwapOutHtlc({
        hash,
        timeout,
        claim_public_key: claimPublicKey,
        service_public_key: swap.service_public_key,
      });

      return {hash, htlc, swap, secret: bufferAsHex(secret)};
    };

    // The client makes two swaps that time out at the same height
    const claimed = await makeSwap();
    const refunded = await makeSwap();

    // The client gets the status of the swap that times out
    const updates = [];

    const sub = subscribeToSwapOutStatus({
      metadata,
      service,
      id: refunded.hash,
    });

    sub.on('status_update', update => updates.push(update));

    // Wait for the subscription to get the status of the new swap
    await asyncRetry({interval, times}, async () => {
      if (!updates.length) {
        throw new Error('ExpectedStatusOfNewSwap');
      }
    });

    // The client pays for both swaps, the service holds the payments
    const claimedPay = paySwap({lnd: client.lnd, swap: claimed.swap});
    const refundedPay = paySwap({lnd: client.lnd, swap: refunded.swap});

    // The service publishes the HTLCs once the payments are held
    const claimedHtlc = await asyncRetry({interval, times}, async () => {
      return await swapServer.publish({id: claimed.hash});
    });

    const refundedHtlc = await asyncRetry({interval, times}, async () => {
      return await swapServer.publish({id: refunded.hash});
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

    // The client mines its blocks on top of the service blocks
    await waitForSameChainTip({lnds});

    const lookup = {
      network,
      tokens,
      after: height.current_block_height,
      confirmations: 1,
      lnd: client.lnd,
      timeout: depositTimeoutMs,
    };

    // The client finds each HTLC by its output script once it confirms
    const claimedDeposit = await findDepositTo({
      ...lookup,
      output_script: claimed.htlc.output_script,
    });

    const refundedDeposit = await findDepositTo({
      ...lookup,
      output_script: refunded.htlc.output_script,
    });

    deepEqual(claimedDeposit, depositOf(claimedHtlc), 'Found the first HTLC');
    deepEqual(refundedDeposit, depositOf(refundedHtlc), 'Found second HTLC');

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

    // The client watches its HTLCs to see which ones are spent by what
    const claimedWatch = watchHtlc({
      htlc: claimedHtlc,
      lnd: client.lnd,
      script: claimed.htlc.output_script,
      start: height.current_block_height,
    });

    const refundedWatch = watchHtlc({
      htlc: refundedHtlc,
      lnd: client.lnd,
      script: refunded.htlc.output_script,
      start: height.current_block_height,
    });

    // The service cannot refund before the timeout of the swaps
    await rejects(
      swapServer.refund({address: refundAddress.address, id: claimed.hash}),
      isRefused,
      'A refund is not final before the swap timeout'
    );

    await rejects(
      swapServer.refund({address: refundAddress.address, id: refunded.hash}),
      isRefused,
      'A refund is not final before the swap timeout'
    );

    // The service keeps holding the swap payments while it cannot refund
    const [claimedFund, refundedFund] = await Promise.all([
      getInvoice({id: claimed.hash, lnd: server.lnd}),
      getInvoice({id: refunded.hash, lnd: server.lnd}),
    ]);

    equal(claimedFund.is_held, true, 'The first swap payment is held');
    equal(refundedFund.is_held, true, 'The second swap payment is held');

    const claimBase = {
      network,
      tokens,
      current_height: tip.current_block_height,
      deadline_height: timeout,
      lnd: client.lnd,
      max_fee_multiplier: maxFeeMultiplier,
      min_fee_rate: feeRate,
      private_key: claimKey,
      start_height: height.current_block_height,
      sweep_address: sweepAddress.address,
    };

    // A claim of the HTLC of a swap with the preimage of the swap
    const claimOf = ({htlc, published, secret}) => ({
      ...claimBase,
      secret,
      claim_script: htlc.claim,
      external_key: htlc.external_key,
      internal_key: htlc.internal_key,
      output_script: htlc.output_script,
      script_branches: htlc.branches,
      transaction_id: published.transaction_id,
      transaction_vout: published.transaction_vout,
    });

    const firstClaim = claimOf({
      htlc: claimed.htlc,
      published: claimedHtlc,
      secret: claimed.secret,
    });

    // The client claims the first swap just before the refund path opens
    const sweep = await attemptTaprootClaim(firstClaim);

    const sweepId = idForTransaction({transaction: sweep.transaction}).id;

    // The claim confirms in the block that opens the refund path
    await client.generate({});

    await waitForConfirmed({id: sweepId, lnd: client.lnd});

    // The service mines its blocks on top of the client block
    await waitForSameChainTip({lnds});

    // The service cannot refund the swap that the client claimed
    await rejects(
      swapServer.refund({address: refundAddress.address, id: claimed.hash}),
      isRefused,
      'A claimed HTLC cannot be refunded'
    );

    // The service refunds the swap that the client did not claim in time
    const refund = await swapServer.refund({
      address: refundAddress.address,
      id: refunded.hash,
    });

    const refundTx = componentsOfTransaction({
      transaction: refund.transaction,
    });

    const [refundInput] = refundTx.inputs;

    // The refund witness is a signature, the refund leaf and a control block
    const [, leaf] = refundInput.witness;

    equal(refundInput.id, refundedHtlc.transaction_id, 'Refund spends HTLC');
    equal(leaf, refunded.htlc.refund, 'Refund spends with the refund leaf');
    equal(refundTx.locktime, timeout, 'Refund is locked to the timeout');

    const refundId = idForTransaction({transaction: refund.transaction}).id;

    // The service mines the refund
    await server.generate({});

    await waitForConfirmed({id: refundId, lnd: server.lnd});

    // The client mines its blocks on top of the service blocks
    await waitForSameChainTip({lnds});

    const lateTip = await getHeight({lnd: client.lnd});

    const lateClaim = claimOf({
      htlc: refunded.htlc,
      published: refundedHtlc,
      secret: refunded.secret,
    });

    // The client cannot claim the swap that the service refunded
    await rejects(
      attemptTaprootClaim({
        ...lateClaim,
        current_height: lateTip.current_block_height,
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
      id: claimed.hash,
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
    swapServer.update({id: refunded.hash, state: refundedState});

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

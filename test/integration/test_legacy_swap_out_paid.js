const {deepEqual} = require('node:assert').strict;
const {equal} = require('node:assert').strict;
const test = require('node:test');

const asyncRetry = require('async/retry');
const {componentsOfTransaction} = require('@alexbosworth/blockchain');
const {createChainAddress} = require('ln-service');
const {getChainTransactions} = require('ln-service');
const {getHeight} = require('ln-service');
const {getUtxos} = require('ln-service');
const {getWalletInfo} = require('ln-service');
const {idForTransaction} = require('@alexbosworth/blockchain');
const {outputScriptForAddress} = require('@alexbosworth/blockchain');
const {parsePaymentRequest} = require('ln-service');
const {pay} = require('ln-service');
const {setupChannel} = require('ln-docker-daemons');
const {spawnLightningCluster} = require('ln-docker-daemons');

const {attemptSweep} = require('./../../');
const {createLegacySwapOut} = require('./../../');
const {findDeposit} = require('./../../');
const {findSecret} = require('./../../');
const {getSwapOutQuote} = require('./../../');
const {getSwapOutTerms} = require('./../../');
const {lightningLabsSwapAuth} = require('./../../');
const {lightningLabsSwapService} = require('./../../');
const {subscribeToSpend} = require('./../../');
const {subscribeToSwapOutStatus} = require('./../../');
const {swapOutServer} = require('./../macros');
const {waitForSameChainTip} = require('./../macros');

const blockstreamApi = 'https://blockstream.info/regtest/api';
const bufferAsHex = buffer => buffer.toString('hex');
const bumpBlocks = 50;
const channelCapacity = 2e6;
const cltvDelta = 100;
const depositTimeoutMs = 1000 * 60;
const family = 805;
const feeRate = 2;
const flatten = arr => [].concat(...arr);
const interval = 10;
const macaroon = Buffer.from('macaroon').toString('base64');
const maturity = 100;
const maxFeeMultiplier = 10;
const network = 'btcregtest';
const notFoundCode = 404;
const okCode = 200;
const outpoint = n => `${n.id}:${n.vout}`;
const preimage = Buffer.alloc(32).toString('hex');
const prepayTokens = 3000;
const size = 2;
const swapFee = 1000;
const times = 2000;
const tokens = 250000;

// Swap status flags for published, confirmed and claimed as a swap goes on
const statusFlags = [
  [false, false, false],
  [true, false, false],
  [true, true, false],
  [true, true, true],
];

// Esplora transactions of an output script, from the transactions of nodes
const apiTransactions = async ({lnds, script}) => {
  const getTxs = lnds.map(lnd => getChainTransactions({lnd}));

  const lists = await Promise.all(getTxs);

  const all = flatten(lists.map(n => n.transactions));

  const ids = all.map(tx => tx.id);

  // Each node has its own copy of the transactions that they share
  const unique = all.filter((tx, i) => ids.indexOf(tx.id) === i);

  const txs = unique.filter(tx => !!tx.transaction).map(tx => ({
    tx,
    components: componentsOfTransaction({transaction: tx.transaction}),
  }));

  // Outpoints of the outputs that pay to the script
  const paid = flatten(txs.map(({components, tx}) => {
    const vouts = components.outputs.map((output, vout) => ({output, vout}));

    const toScript = vouts.filter(({output}) => output.script === script);

    return toScript.map(({vout}) => outpoint({vout, id: tx.id}));
  }));

  // Transactions of the script pay to it or spend from it
  const related = txs.filter(({components}) => {
    const spent = components.inputs.map(input => outpoint(input));

    if (spent.some(n => paid.includes(n))) {
      return true;
    }

    return components.outputs.some(output => output.script === script);
  });

  return related.map(({components, tx}) => ({
    status: {block_height: tx.confirmation_height, confirmed: tx.is_confirmed},
    txid: tx.id,
    vin: components.inputs.map(input => ({
      txid: input.id,
      vout: input.vout,
      witness: input.witness,
    })),
    vout: components.outputs.map(output => ({
      scriptpubkey: output.script,
      value: output.tokens,
    })),
  }));
};

// Answer Blockstream API requests for the transactions of an address
const blockstreamRequest = ({address, lnds, script}) => ({url}, cbk) => {
  // Exit early when the request is not for the transactions of the address
  if (url !== `${blockstreamApi}/address/${address}/txs`) {
    return cbk(null, {statusCode: notFoundCode});
  }

  return apiTransactions({lnds, script}).then(
    txs => cbk(null, {statusCode: okCode}, txs),
    err => cbk(err)
  );
};

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

// A swap out is paid with held payments and claimed with a fee bump
test(`Swap out with a P2WSH HTLC`, async () => {
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

    // The client gets the limits of swaps and a quote for its swap
    const terms = await getSwapOutTerms({metadata, service});

    equal(terms.min_cltv_delta, cltvDelta, 'Service needs a CLTV delta');
    equal(tokens >= terms.min_tokens, true, 'Tokens are above the minimum');
    equal(tokens <= terms.max_tokens, true, 'Tokens are below the maximum');

    const height = await getHeight({lnd: client.lnd});
    const wallet = await getWalletInfo({lnd: server.lnd});

    const timeout = height.current_block_height + cltvDelta;

    const quote = await getSwapOutQuote({metadata, service, timeout, tokens});

    deepEqual(
      quote,
      {deposit: prepayTokens, destination: wallet.public_key, fee: swapFee},
      'Got a quote for the swap'
    );

    const swap = await createLegacySwapOut({
      metadata,
      network,
      service,
      timeout,
      tokens,
    });

    const {id} = parsePaymentRequest({request: swap.swap_fund_request});

    const [request] = swapServer.requests.newLoopOutSwap;

    // The service gets the details of the swap
    equal(request.amt, String(tokens), 'Service gets swap tokens');
    equal(request.expiry, timeout, 'Service gets the swap timeout');
    equal(request.protocol_version, 'LOOP_OUT_CANCEL', 'Got P2WSH swap');
    equal(bufferAsHex(request.swap_hash), id, 'Service gets the swap hash');

    // The client gets the status of the swap as it changes
    const updates = [];

    const sub = subscribeToSwapOutStatus({id, metadata, service});

    sub.on('status_update', update => updates.push(update));

    // Wait for the subscription to get the status of the new swap
    await asyncRetry({interval, times}, async () => {
      if (!updates.length) {
        throw new Error('ExpectedStatusOfNewSwap');
      }
    });

    // The client pays the prepay and the swap, the service holds both
    const prepaying = payRequest({
      lnd: client.lnd,
      request: swap.swap_execute_request,
    });

    const paying = payRequest({
      lnd: client.lnd,
      request: swap.swap_fund_request,
    });

    // The service publishes the HTLC once both payments are held
    const htlc = await asyncRetry({interval, times}, async () => {
      return await swapServer.publish({id});
    });

    // The prepay is taken when the HTLC is published
    const prepay = await prepaying;

    equal(prepay.paid.tokens, prepayTokens, 'Client paid the prepay');

    const {outputs} = componentsOfTransaction({transaction: htlc.transaction});

    const swapScript = outputScriptForAddress({
      network,
      address: swap.address,
    });

    const htlcOutput = outputs[htlc.transaction_vout];

    equal(htlcOutput.script, swapScript.script, 'HTLC pays to the swap');
    equal(htlcOutput.tokens, tokens, 'HTLC pays the swap tokens');

    // The service mines the HTLC into a block
    await asyncRetry({interval, times}, async () => {
      await server.generate({});

      const {transactions} = await getChainTransactions({lnd: server.lnd});

      const tx = transactions.find(n => n.id === htlc.transaction_id);

      if (!tx || !tx.is_confirmed) {
        throw new Error('ExpectedSwapHtlcConfirmed');
      }
    });

    // The client mines its blocks on top of the service blocks
    await waitForSameChainTip({lnds});

    swapServer.update({id, state: 'SERVER_HTLC_CONFIRMED'});

    // The client finds the HTLC once it confirms with the swap tokens
    const deposit = await findDepositTo({
      network,
      tokens,
      address: swap.address,
      after: height.current_block_height,
      confirmations: 1,
      lnd: client.lnd,
      timeout: depositTimeoutMs,
    });

    equal(deposit.transaction_id, htlc.transaction_id, 'Client found HTLC');
    equal(deposit.transaction_vout, htlc.transaction_vout, 'Found HTLC vout');
    equal(deposit.output_tokens, tokens, 'Found HTLC tokens');

    // The service watches for the client to spend the HTLC
    const watch = {errors: [], spends: []};

    const spendWatcher = subscribeToSpend({
      lnd: server.lnd,
      min_height: height.current_block_height,
      output_script: swapScript.script,
      transaction_id: htlc.transaction_id,
      transaction_vout: htlc.transaction_vout,
    });

    spendWatcher.on('confirmation', ({transaction}) => {
      return watch.spends.push(transaction);
    });

    spendWatcher.on('error', err => watch.errors.push(err));

    const tip = await getHeight({lnd: client.lnd});

    const {address} = await createChainAddress({lnd: client.lnd});

    const claim = {
      network,
      tokens,
      current_height: tip.current_block_height,
      deadline_height: timeout,
      lnd: client.lnd,
      max_fee_multiplier: maxFeeMultiplier,
      min_fee_rate: feeRate,
      private_key: swap.private_key,
      secret: swap.secret,
      sweep_address: address,
      transaction_id: htlc.transaction_id,
      transaction_vout: htlc.transaction_vout,
      witness_script: swap.script,
    };

    // The client claims the HTLC at the minimum fee rate
    const first = await attemptSweep({
      ...claim,
      start_height: tip.current_block_height,
    });

    // A claim further along its fee schedule replaces the first claim
    const bumped = await attemptSweep({
      ...claim,
      start_height: tip.current_block_height - bumpBlocks,
    });

    equal(bumped.fee_rate > first.fee_rate, true, 'Replacement pays more');

    const claimId = idForTransaction({transaction: bumped.transaction}).id;

    // The client mines the replacement claim
    await asyncRetry({interval, times}, async () => {
      await client.generate({});

      const {utxos} = await getUtxos({lnd: client.lnd});

      const utxo = utxos.find(n => n.transaction_id === claimId);

      if (!utxo || !utxo.confirmation_count) {
        throw new Error('ExpectedReplacementClaimConfirmed');
      }
    });

    // The service mines its blocks on top of the client blocks
    await waitForSameChainTip({lnds});

    // The service sees the claim that confirmed spend the HTLC
    await asyncRetry({interval, times}, async () => {
      if (!watch.spends.length) {
        throw new Error('ExpectedServiceToSeeHtlcSpend');
      }
    });

    spendWatcher.removeAllListeners();

    const [spend] = watch.spends;

    const spendId = idForTransaction({transaction: spend}).id;

    deepEqual(watch.errors, [], 'No errors watching the HTLC');
    equal(spendId, claimId, 'Service saw the replacement claim');

    // The service finds the preimage on chain with the Blockstream API
    const api = blockstreamRequest({
      lnds,
      address: swap.address,
      script: swapScript.script,
    });

    const found = await findSecret({
      network,
      address: swap.address,
      hash: id,
      request: api,
    });

    equal(found.secret, swap.secret, 'Service found the preimage');

    // The service settles the payment with the preimage
    await swapServer.settle({id, secret: found.secret});

    const swapPayment = await paying;

    equal(swapPayment.paid.secret, swap.secret, 'Swap payment is settled');

    equal(
      swapPayment.paid.tokens,
      tokens + swapFee - prepayTokens,
      'Client paid the swap tokens and the fee, less the prepay'
    );

    // Wait for the client to get the status updates of the swap
    await asyncRetry({interval, times}, async () => {
      if (updates.length < statusFlags.length) {
        throw new Error('ExpectedSwapStatusUpdates');
      }
    });

    deepEqual(
      updates.map(n => [n.is_broadcast, n.is_confirmed, n.is_claimed]),
      statusFlags,
      'The client sees the swap start, publish, confirm and get claimed'
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

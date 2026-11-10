const {deepEqual} = require('node:assert').strict;
const {equal} = require('node:assert').strict;
const {once} = require('node:events');
const test = require('node:test');

const asyncRetry = require('async/retry');
const {componentsOfTransaction} = require('@alexbosworth/blockchain');
const {createChainAddress} = require('ln-service');
const {createInvoice} = require('ln-service');
const {getChainTransactions} = require('ln-service');
const {getHeight} = require('ln-service');
const {getPublicKey} = require('ln-service');
const {getUtxos} = require('ln-service');
const {idForTransaction} = require('@alexbosworth/blockchain');
const {pay} = require('ln-service');
const {sendToChainOutputScripts} = require('ln-service');
const {setupChannel} = require('ln-docker-daemons');
const {spawnLightningCluster} = require('ln-docker-daemons');

const {broadcastTransaction} = require('./../../');
const {createSharedAddress} = require('./../../');
const {createSwapIn} = require('./../../');
const {getSharedUtxos} = require('./../../');
const {lightningLabsSwapAuth} = require('./../../');
const {lightningLabsSwapService} = require('./../../');
const {refundTransaction} = require('./../../');
const {sharedAddressScript} = require('./../../');
const {signSwapInCoopSettlement} = require('./../../');
const {signSwapInServiceFallback} = require('./../../');
const {staticAddressSwapServer} = require('./../macros');
const {subscribeToSwapInStatus} = require('./../../');
const {waitForSameChainTip} = require('./../macros');

const cltvDelta = 50;
const expiry = 14400;
const family = 42060;
const feeRate = 2;
const hexAsBuffer = hex => Buffer.from(hex, 'hex');
const interval = 10;
const macaroon = Buffer.from('macaroon').toString('base64');
const maturity = 100;
const maxCltvDelta = 60;
const network = 'btcregtest';
const preimage = Buffer.alloc(32).toString('hex');
const size = 2;
const standardFeeRate = 'standard';
const sumOf = utxos => utxos.reduce((sum, n) => sum + n.tokens, 0);
const swapFee = 1000;
const sweepFee = 5000;
const times = 2000;
const utxosTokens = {htlc: [150000], sweep: [70000, 50000]};

// A swap in of all its utxos has no change, by HTLC or by coop settlement
test(`Swap in all utxos`, async () => {
  const {kill, nodes} = await spawnLightningCluster({size});

  const [client, server] = nodes;

  const lnds = [client.lnd, server.lnd];

  const swapServer = await staticAddressSwapServer({
    expiry,
    network,
    cltv_delta: cltvDelta,
    fee: swapFee,
    key_family: family,
    lnd: server.lnd,
  });

  const {metadata} = lightningLabsSwapAuth({macaroon, preimage});

  const {service} = lightningLabsSwapService({
    network,
    cert: swapServer.cert,
    socket: swapServer.socket,
  });

  const errors = [];
  const sub = subscribeToSwapInStatus({metadata, service});

  sub.on('error', err => errors.push(err));

  try {
    await client.generate({count: maturity});

    // The service mines its blocks on top of the client blocks
    await waitForSameChainTip({lnds});

    // The service pays swaps with a channel to the client
    await setupChannel({
      generate: server.generate,
      lnd: server.lnd,
      to: client,
    });

    // The client mines its blocks on top of the service blocks
    await waitForSameChainTip({lnds});

    const clientKey = await getPublicKey({family, lnd: client.lnd});

    // Make a shared address with the service
    const address = await createSharedAddress({
      metadata,
      network,
      service,
      public_key: clientKey.public_key,
    });

    const shared = sharedAddressScript({
      expiry,
      network,
      client_public_key: clientKey.public_key,
      server_public_key: address.service_public_key,
    });

    // The client listens for the service to ask it to cosign sweeps
    await swapServer.subscribed;

    const start = await getHeight({lnd: client.lnd});

    const values = utxosTokens.htlc.concat(utxosTokens.sweep);

    // Make utxos to the shared address for two swaps
    const funding = await sendToChainOutputScripts({
      fee_tokens_per_vbyte: feeRate,
      lnd: client.lnd,
      send_to: values.map(value => ({
        script: shared.output_script,
        tokens: value,
      })),
    });

    // Wait for the utxos to confirm
    await asyncRetry({interval, times}, async () => {
      await client.generate({});

      const {transactions} = await getChainTransactions({lnd: client.lnd});

      const tx = transactions.find(n => n.id === funding.id);

      if (!tx || !tx.is_confirmed) {
        throw new Error('ExpectedSharedUtxosConfirmed');
      }
    });

    const {outputs} = componentsOfTransaction({
      transaction: funding.transaction,
    });

    // Utxo values are different, so each utxo can be told apart
    const utxoFor = value => ({
      tokens: value,
      transaction_id: funding.id,
      transaction_vout: outputs.findIndex(output => {
        const isShared = output.script === shared.output_script;

        return isShared && output.tokens === value;
      }),
    });

    const htlcUtxos = utxosTokens.htlc.map(utxoFor);
    const sweepUtxos = utxosTokens.sweep.map(utxoFor);

    // The service knows about the utxos sent to the shared address
    swapServer.addUtxos({utxos: htlcUtxos.concat(sweepUtxos)});

    // Make a swap in of a utxo where the swap tokens are all of the utxo
    const htlcInvoice = await createInvoice({
      lnd: client.lnd,
      tokens: sumOf(htlcUtxos) - swapFee,
    });

    const htlcHeight = await getHeight({lnd: client.lnd});

    const htlcSwap = await createSwapIn({
      metadata,
      service,
      fee: swapFee,
      max_timeout_height: htlcHeight.current_block_height + maxCltvDelta,
      request: htlcInvoice.request,
      utxos: htlcUtxos,
    });

    const [htlcRequest] = swapServer.requests.serverStaticAddressLoopIn;

    // Without change the service is not asked for an amount, it uses it all
    equal(htlcRequest.amount, '0', 'No swap amount is sent without change');
    equal(htlcSwap.tokens, sumOf(htlcUtxos), 'Swap is for all of the utxo');

    // Sign the HTLC transactions that the service can publish
    const signed = await signSwapInServiceFallback({
      expiry,
      metadata,
      network,
      service,
      fallbacks: htlcSwap.fallbacks,
      id: htlcSwap.id,
      key_family: family,
      key_index: clientKey.index,
      lnd: client.lnd,
      script: htlcSwap.script,
      service_public_key: address.service_public_key,
      tokens: htlcSwap.tokens,
      utxos: htlcUtxos,
    });

    const htlcs = swapServer.htlcs({id: htlcSwap.id});

    // The service makes the same HTLC transactions, without change outputs
    signed.transactions.forEach(({id, type}) => {
      const {fee} = htlcSwap.fallbacks.find(n => n.type === type);
      const htlc = htlcs.find(n => n.type === type);

      const tx = componentsOfTransaction({transaction: htlc.transaction});

      equal(htlc.id, id, `Service has the ${type} fee rate HTLC transaction`);
      equal(htlc.fee, fee, `Client has the ${type} fee rate HTLC fee`);
      equal(tx.outputs.length, 1, 'The HTLC is the only output');
    });

    const htlc = htlcs.find(n => n.type === standardFeeRate);

    const [htlcOutput] = componentsOfTransaction({
      transaction: htlc.transaction,
    }).outputs;

    equal(htlcOutput.tokens, htlcSwap.tokens - htlc.fee, 'HTLC pays it all');

    // The service has the client blocks before it publishes and mines
    await waitForSameChainTip({lnds});

    // The service publishes the HTLC but it does not pay the swap
    await broadcastTransaction({
      lnd: server.lnd,
      transaction: htlc.transaction,
    });

    // The client refunds the HTLC once it times out
    await asyncRetry({interval, times}, async () => {
      await server.generate({});

      const height = await getHeight({lnd: client.lnd});

      if (height.current_block_height < htlcSwap.timeout) {
        throw new Error('ExpectedHtlcTimeoutReached');
      }
    });

    // The client has the service blocks before it refunds and mines
    await waitForSameChainTip({lnds});

    const refund = refundTransaction({
      network,
      block_height: htlcSwap.timeout,
      fee_tokens_per_vbyte: feeRate,
      private_key: htlcSwap.private_key,
      sweep_address: (await createChainAddress({lnd: client.lnd})).address,
      tokens: htlcOutput.tokens,
      transaction_id: htlc.id,
      transaction_vout: Number(),
      witness_script: htlcSwap.script,
    });

    await broadcastTransaction({
      lnd: client.lnd,
      transaction: refund.transaction,
    });

    const refundId = idForTransaction({transaction: refund.transaction}).id;

    // Wait for the refund to confirm
    await asyncRetry({interval, times}, async () => {
      await client.generate({});

      const {utxos} = await getUtxos({lnd: client.lnd});

      const utxo = utxos.find(n => n.transaction_id === refundId);

      if (!utxo || !utxo.confirmation_count) {
        throw new Error('ExpectedHtlcRefundConfirmed');
      }
    });

    // Make a swap in of utxos that the service settles cooperatively
    const sweepInvoice = await createInvoice({
      lnd: client.lnd,
      tokens: sumOf(sweepUtxos) - swapFee,
    });

    const height = await getHeight({lnd: client.lnd});

    const sweepSwap = await createSwapIn({
      metadata,
      service,
      fee: swapFee,
      max_timeout_height: height.current_block_height + maxCltvDelta,
      request: sweepInvoice.request,
      utxos: sweepUtxos,
    });

    await signSwapInServiceFallback({
      expiry,
      metadata,
      network,
      service,
      fallbacks: sweepSwap.fallbacks,
      id: sweepSwap.id,
      key_family: family,
      key_index: clientKey.index,
      lnd: client.lnd,
      script: sweepSwap.script,
      service_public_key: address.service_public_key,
      tokens: sweepSwap.tokens,
      utxos: sweepUtxos,
    });

    const accepted = once(sub, 'risk_accepted');

    // The service takes the risk of the utxos and pays the swap
    swapServer.notify({
      static_loop_in_risk_accepted: {swap_hash: hexAsBuffer(sweepSwap.id)},
    });

    const [acceptance] = await accepted;

    equal(acceptance.id, sweepSwap.id, 'Service accepted the swap risk');

    await asyncRetry({interval, times}, async () => {
      return await pay({lnd: server.lnd, request: sweepInvoice.request});
    });

    // The swap that the client cosigns the sweep of
    const swept = {
      id: sweepSwap.id,
      tokens: sweepSwap.tokens,
      utxos: sweepUtxos,
    };

    // The client cosigns the sweep of the swap now that it is paid
    const cosign = new Promise((resolve, reject) => {
      return sub.once('coop_settlement', settlement => {
        return signSwapInCoopSettlement({
          expiry,
          metadata,
          network,
          service,
          id: settlement.id,
          key_family: family,
          key_index: clientKey.index,
          lnd: client.lnd,
          nonces: settlement.nonces,
          prevouts: settlement.prevouts,
          psbt: settlement.psbt,
          service_public_key: address.service_public_key,
          swaps: [swept],
        })
        .then(resolve, reject);
      });
    });

    const {address: serviceAddress} = await createChainAddress({
      lnd: server.lnd,
    });

    const [cosigned, sweep] = await Promise.all([
      cosign,
      swapServer.sweep({
        address: serviceAddress,
        fee: sweepFee,
        id: sweepSwap.id,
      }),
    ]);

    equal(cosigned.transaction_id, sweep.id, 'Client cosigned the sweep');

    const sweepTx = componentsOfTransaction({transaction: sweep.transaction});

    equal(sweepTx.outputs.length, 1, 'The sweep has no change');

    // The service has the client blocks before it publishes and mines
    await waitForSameChainTip({lnds});

    await broadcastTransaction({
      lnd: server.lnd,
      transaction: sweep.transaction,
    });

    // Wait for the service to receive the swept utxos
    const received = await asyncRetry({interval, times}, async () => {
      await server.generate({});

      const {utxos} = await getUtxos({lnd: server.lnd});

      const utxo = utxos.find(n => n.transaction_id === sweep.id);

      if (!utxo || !utxo.confirmation_count) {
        throw new Error('ExpectedSweepConfirmed');
      }

      return utxo;
    });

    equal(received.tokens, sweepSwap.tokens - sweepFee, 'Service got it all');

    // No utxos are left at the shared address
    await asyncRetry({interval, times}, async () => {
      const {utxos} = await getSharedUtxos({
        network,
        address: address.address,
        lnd: client.lnd,
        min_height: start.current_block_height,
      });

      if (!!utxos.length) {
        throw new Error('ExpectedNoSharedUtxosLeft');
      }

      deepEqual(utxos, [], 'Every utxo is swapped');
    });

    deepEqual(errors, [], 'No errors from the swap in status subscription');
  } catch (err) {
    equal(err, null, 'Expected no error');
  } finally {
    sub.removeAllListeners();

    service.close();

    swapServer.stop();

    await kill({});
  }

  return;
});

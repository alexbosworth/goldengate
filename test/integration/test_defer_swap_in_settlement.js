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
const {getInvoice} = require('ln-service');
const {getPublicKey} = require('ln-service');
const {getUtxos} = require('ln-service');
const {pay} = require('ln-service');
const {sendToChainOutputScripts} = require('ln-service');
const {setupChannel} = require('ln-docker-daemons');
const {spawnLightningCluster} = require('ln-docker-daemons');

const {broadcastTransaction} = require('./../../');
const {createSharedAddress} = require('./../../');
const {createSwapIn} = require('./../../');
const {deferSwapInCoopSettlement} = require('./../../');
const {getSwapInQuote} = require('./../../');
const {lightningLabsSwapAuth} = require('./../../');
const {lightningLabsSwapService} = require('./../../');
const {sharedAddressScript} = require('./../../');
const {signSwapInCoopSettlement} = require('./../../');
const {signSwapInServiceFallback} = require('./../../');
const {staticAddressSwapServer} = require('./../macros');
const {subscribeToSwapInStatus} = require('./../../');
const {waitForSameChainTip} = require('./../macros');

const bufferAsHex = buffer => buffer.toString('hex');
const cltvDelta = 50;
const expiry = 14400;
const family = 42060;
const feeRate = 2;
const interval = 10;
const macaroon = Buffer.from('macaroon').toString('base64');
const maturity = 100;
const maxCltvDelta = 60;
const network = 'btcregtest';
const preimage = Buffer.alloc(32).toString('hex');
const size = 2;
const swapFee = 1000;
const sweepFee = 5000;
const times = 2000;
const tokens = 251000;
const utxosTokens = [200000, 100000];

// A client defers cosigning an unpaid fast swap in, then cosigns once paid
test(`Defer swap in settlement`, async () => {
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

    // The service pays the swap with a channel to the client
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

    // Make two utxos to the shared address
    const funding = await sendToChainOutputScripts({
      fee_tokens_per_vbyte: feeRate,
      lnd: client.lnd,
      send_to: utxosTokens.map(value => ({
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

    const utxos = utxosTokens.map(value => ({
      tokens: value,
      transaction_id: funding.id,
      transaction_vout: outputs.findIndex(output => {
        const isShared = output.script === shared.output_script;

        return isShared && output.tokens === value;
      }),
    }));

    // The service knows about the utxos sent to the shared address
    swapServer.addUtxos({utxos});

    // The client quotes and makes a fast swap
    const quote = await getSwapInQuote({
      metadata,
      service,
      tokens,
      is_fast: true,
      utxos_count: utxos.length,
    });

    const invoice = await createInvoice({
      lnd: client.lnd,
      tokens: tokens - quote.fee,
    });

    const height = await getHeight({lnd: client.lnd});

    const swap = await createSwapIn({
      metadata,
      service,
      utxos,
      fee: quote.fee,
      is_fast: true,
      max_timeout_height: height.current_block_height + maxCltvDelta,
      request: invoice.request,
    });

    const [quoteRequest] = swapServer.requests.loopInQuote;
    const [request] = swapServer.requests.serverStaticAddressLoopIn;

    equal(quoteRequest.fast, true, 'Service quotes a fast swap');
    equal(request.fast, true, 'Service is asked for a fast swap');

    await signSwapInServiceFallback({
      expiry,
      metadata,
      network,
      service,
      utxos,
      fallbacks: swap.fallbacks,
      id: swap.id,
      key_family: family,
      key_index: clientKey.index,
      lnd: client.lnd,
      script: swap.script,
      service_public_key: address.service_public_key,
      tokens: swap.tokens,
    });

    const {address: serviceAddress} = await createChainAddress({
      lnd: server.lnd,
    });

    const asked = once(sub, 'coop_settlement');

    // The service asks to cosign the sweep of the swap before it pays
    const swept = swapServer.sweep({
      address: serviceAddress,
      fee: sweepFee,
      id: swap.id,
    });

    // A failure of the sweep is seen once the sweep is awaited
    swept.catch(() => {});

    const [settlement] = await asked;

    const unpaid = await getInvoice({id: swap.id, lnd: client.lnd});

    equal(unpaid.is_confirmed, false, 'The swap is not paid yet');

    // The client defers cosigning the sweep since the swap is not paid
    await deferSwapInCoopSettlement({
      metadata,
      service,
      id: settlement.id,
      psbt: settlement.psbt,
    });

    const [deferral] = swapServer.requests.pushStaticAddressSweeplessSigs;

    equal(bufferAsHex(deferral.swap_hash), swap.id, 'Deferred the swap sweep');
    equal(!!deferral.error_message, true, 'The deferral says why');
    deepEqual(deferral.signing_info, {}, 'No signatures are in a deferral');

    // The service pays the swap once the channel is ready to use
    await asyncRetry({interval, times}, async () => {
      return await pay({lnd: server.lnd, request: invoice.request});
    });

    const askedAgain = once(sub, 'coop_settlement');

    // The service asks again to cosign the sweep
    swapServer.resendSweep({id: swap.id});

    const [paidSettlement] = await askedAgain;

    equal(paidSettlement.psbt, settlement.psbt, 'Service asks for the sweep');

    // The client cosigns the sweep now that the swap is paid
    const cosigned = await signSwapInCoopSettlement({
      expiry,
      metadata,
      network,
      service,
      id: paidSettlement.id,
      key_family: family,
      key_index: clientKey.index,
      lnd: client.lnd,
      nonces: paidSettlement.nonces,
      prevouts: paidSettlement.prevouts,
      psbt: paidSettlement.psbt,
      service_public_key: address.service_public_key,
      swaps: [{utxos, id: swap.id, tokens: swap.tokens}],
    });

    const sweep = await swept;

    equal(cosigned.transaction_id, sweep.id, 'Client cosigned the sweep');

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

    equal(received.tokens, swap.tokens - sweepFee, 'Service swept the swap');

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

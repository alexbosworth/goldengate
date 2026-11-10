const {deepEqual} = require('node:assert').strict;
const {equal} = require('node:assert').strict;
const {once} = require('node:events');
const {rejects} = require('node:assert').strict;
const test = require('node:test');

const asyncEachSeries = require('async/eachSeries');
const asyncRetry = require('async/retry');
const {componentsOfTransaction} = require('@alexbosworth/blockchain');
const {createChainAddress} = require('ln-service');
const {createInvoice} = require('ln-service');
const {getHeight} = require('ln-service');
const {getInvoice} = require('ln-service');
const {getPublicKey} = require('ln-service');
const {getUtxos} = require('ln-service');
const {sendToChainOutputScripts} = require('ln-service');
const {spawnLightningCluster} = require('ln-docker-daemons');

const {broadcastTransaction} = require('./../../');
const {createSharedAddress} = require('./../../');
const {createSwapIn} = require('./../../');
const {getSharedUtxos} = require('./../../');
const {lightningLabsSwapAuth} = require('./../../');
const {lightningLabsSwapService} = require('./../../');
const {sharedAddressScript} = require('./../../');
const {signSwapInServiceFallback} = require('./../../');
const {spendSharedUtxos} = require('./../../');
const {staticAddressSwapServer} = require('./../macros');
const {subscribeToSwapInStatus} = require('./../../');

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
const sumOf = utxos => utxos.reduce((sum, n) => sum + n.tokens, 0);
const swapFee = 1000;
const times = 2000;
const tokens = 251000;
const utxosTokens = [200000, 100000];

// A risk rejected swap in is unpaid and the client spends its utxos back
test(`Swap in risk rejected`, async () => {
  const {kill, nodes} = await spawnLightningCluster({size});

  const [client, server] = nodes;

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

    // The client listens for the service to tell it about its swaps
    await swapServer.subscribed;

    const start = await getHeight({lnd: client.lnd});

    // Make two utxos to the shared address, but do not confirm them yet
    const funding = await sendToChainOutputScripts({
      fee_tokens_per_vbyte: feeRate,
      lnd: client.lnd,
      send_to: utxosTokens.map(value => ({
        script: shared.output_script,
        tokens: value,
      })),
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

    // The service knows about the unconfirmed utxos sent to the address
    swapServer.addUtxos({utxos});

    const invoice = await createInvoice({
      lnd: client.lnd,
      tokens: tokens - swapFee,
    });

    // Swap in the unconfirmed utxos
    const swap = await createSwapIn({
      metadata,
      service,
      utxos,
      fee: swapFee,
      max_timeout_height: start.current_block_height + maxCltvDelta,
      request: invoice.request,
    });

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

    const rejected = once(sub, 'risk_rejected');

    // The service does not take the risk of the unconfirmed utxos
    swapServer.notify({
      static_loop_in_risk_rejected: {swap_hash: hexAsBuffer(swap.id)},
    });

    const [rejection] = await rejected;

    equal(rejection.id, swap.id, 'Service rejected the risk of the swap');

    const {is_confirmed} = await getInvoice({id: swap.id, lnd: client.lnd});

    equal(is_confirmed, false, 'A swap with rejected risk is not paid');

    // Spend all of the swap utxos back to the client with the service
    const spend = await spendSharedUtxos({
      expiry,
      metadata,
      network,
      service,
      utxos,
      fee_tokens_per_vbyte: feeRate,
      key_family: family,
      key_index: clientKey.index,
      lnd: client.lnd,
      service_public_key: address.service_public_key,
      sweep_address: (await createChainAddress({lnd: client.lnd})).address,
    });

    const [output, ...change] = componentsOfTransaction({
      transaction: spend.transaction,
    }).outputs;

    deepEqual(change, [], 'Spending all of the utxos has no change');

    // The spend builds on the unconfirmed utxos
    await broadcastTransaction({
      lnd: client.lnd,
      transaction: spend.transaction,
    });

    // Wait for the spend to confirm
    const received = await asyncRetry({interval, times}, async () => {
      await client.generate({});

      const {utxos} = await getUtxos({lnd: client.lnd});

      const utxo = utxos.find(n => n.transaction_id === spend.id);

      if (!utxo || !utxo.confirmation_count) {
        throw new Error('ExpectedSpendConfirmed');
      }

      return utxo;
    });

    equal(received.tokens, output.tokens, 'Client received the utxos');
    equal(output.tokens < sumOf(utxos), true, 'Spend paid a fee');

    // The swap HTLC transactions are invalid once their utxos are spent
    const htlcs = swapServer.htlcs({id: swap.id});

    await asyncEachSeries(htlcs, async ({transaction, type}) => {
      return await rejects(
        broadcastTransaction({transaction, lnd: client.lnd}),
        `The ${type} fee rate HTLC transaction is invalid after the spend`
      );
    });

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

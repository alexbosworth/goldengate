const {deepEqual} = require('node:assert').strict;
const {equal} = require('node:assert').strict;
const {rejects} = require('node:assert').strict;
const test = require('node:test');

const asyncRetry = require('async/retry');
const {componentsOfTransaction} = require('@alexbosworth/blockchain');
const {createChainAddress} = require('ln-service');
const {createInvoice} = require('ln-service');
const {getChainTransactions} = require('ln-service');
const {getHeight} = require('ln-service');
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
const {signSharedUtxosRefund} = require('./../../');
const {signSwapInFallbackRefund} = require('./../../');
const {signSwapInServiceFallback} = require('./../../');
const {staticAddressSwapServer} = require('./../macros');
const {waitForSameChainTip} = require('./../macros');

const cltvDelta = 50;
const expiry = 40;
const family = 42060;
const feeRate = 2;
const htlcKeyFamily = 99;
const interval = 10;
const macaroon = Buffer.from('macaroon').toString('base64');
const maturity = 100;
const maxCltvDelta = 60;
const network = 'btcregtest';
const preimage = Buffer.alloc(32).toString('hex');
const size = 2;
const standardFeeRate = 'standard';
const swapFee = 1000;
const times = 2000;
const tokens = 150000;

// An HTLC published before the utxo expires is refunded instead of the utxo
test(`Shared utxos refund beaten by swap in HTLC`, async () => {
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

  // Mine blocks with the client until the chain tip is at a height
  const mineTo = async height => {
    const tip = await getHeight({lnd: client.lnd});

    if (height > tip.current_block_height) {
      await client.generate({count: height - tip.current_block_height});
    }
  };

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

    equal(address.expiry, expiry, 'The shared address has a short expiry');

    const shared = sharedAddressScript({
      expiry,
      network,
      client_public_key: clientKey.public_key,
      server_public_key: address.service_public_key,
    });

    const start = await getHeight({lnd: client.lnd});

    // Make a utxo to the shared address
    const funding = await sendToChainOutputScripts({
      fee_tokens_per_vbyte: feeRate,
      lnd: client.lnd,
      send_to: [{tokens, script: shared.output_script}],
    });

    // Wait for the utxo to confirm
    const confirmed = await asyncRetry({interval, times}, async () => {
      await client.generate({});

      const {transactions} = await getChainTransactions({lnd: client.lnd});

      const tx = transactions.find(n => n.id === funding.id);

      if (!tx || !tx.is_confirmed) {
        throw new Error('ExpectedSharedUtxoConfirmed');
      }

      return tx;
    });

    const {outputs} = componentsOfTransaction({
      transaction: funding.transaction,
    });

    const utxos = [{
      tokens,
      transaction_id: funding.id,
      transaction_vout: outputs.findIndex(output => {
        return output.script === shared.output_script;
      }),
    }];

    // The service knows about the utxo sent to the shared address
    swapServer.addUtxos({utxos});

    // The HTLC refund key is a key of the client LND
    const htlcKey = await getPublicKey({
      family: htlcKeyFamily,
      lnd: client.lnd,
    });

    const invoice = await createInvoice({
      lnd: client.lnd,
      tokens: tokens - swapFee,
    });

    // The service HTLC timeout is from the same height as the client limit
    await waitForSameChainTip({lnds});

    const height = await getHeight({lnd: client.lnd});

    // Swap all of the utxo so that the HTLC transaction has no change
    const swap = await createSwapIn({
      metadata,
      service,
      utxos,
      fee: swapFee,
      max_timeout_height: height.current_block_height + maxCltvDelta,
      public_key: htlcKey.public_key,
      request: invoice.request,
    });

    // Sign the HTLC transactions that the service can publish
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

    const htlcs = swapServer.htlcs({id: swap.id});

    const htlc = htlcs.find(n => n.type === standardFeeRate);

    // The client changes its mind, it will refund the utxo once it expires
    const expired = await signSharedUtxosRefund({
      expiry,
      network,
      utxos,
      fee_tokens_per_vbyte: feeRate,
      key_family: family,
      key_index: clientKey.index,
      lnd: client.lnd,
      service_public_key: address.service_public_key,
      sweep_address: (await createChainAddress({lnd: client.lnd})).address,
    });

    // The timeout path of the utxo can be spent in blocks from its expiry
    const expiryHeight = confirmed.confirmation_height + expiry;

    // The HTLC times out after the utxo expires
    equal(swap.timeout > expiryHeight, true, 'HTLC timeout is after expiry');

    // Mine to one block before the refund can be published
    await mineTo(expiryHeight - 2);

    // The service has the client blocks before it publishes and mines
    await waitForSameChainTip({lnds});

    // The service publishes the HTLC before the utxo expires and mines it
    await broadcastTransaction({
      lnd: server.lnd,
      transaction: htlc.transaction,
    });

    await server.generate({});

    // The client has the service blocks before it publishes and mines
    await waitForSameChainTip({lnds});

    const tip = await getHeight({lnd: client.lnd});

    // The next block is the expiry height, where the refund would be valid
    equal(tip.current_block_height, expiryHeight - 1, 'Refund can be mined');

    // The HTLC transaction spent the utxo before the timeout path refund
    await rejects(
      broadcastTransaction({
        lnd: client.lnd,
        transaction: expired.transaction,
      }),
      'The timeout path refund is invalid once the HTLC spends the utxo'
    );

    const [htlcOutput] = componentsOfTransaction({
      transaction: htlc.transaction,
    }).outputs;

    // The client refunds the HTLC instead, once the HTLC times out
    const refund = await signSwapInFallbackRefund({
      network,
      fee_tokens_per_vbyte: feeRate,
      hash: swap.id,
      key_family: htlcKeyFamily,
      key_index: htlcKey.index,
      lnd: client.lnd,
      service_public_key: swap.service_public_key,
      sweep_address: (await createChainAddress({lnd: client.lnd})).address,
      timeout: swap.timeout,
      utxos: [{
        tokens: htlcOutput.tokens,
        transaction_id: htlc.id,
        transaction_vout: Number(),
      }],
    });

    await mineTo(swap.timeout);

    await broadcastTransaction({
      lnd: client.lnd,
      transaction: refund.transaction,
    });

    // Wait for the refund to confirm
    await asyncRetry({interval, times}, async () => {
      await client.generate({});

      const wallet = await getUtxos({lnd: client.lnd});

      const utxo = wallet.utxos.find(n => n.transaction_id === refund.id);

      if (!utxo || !utxo.confirmation_count) {
        throw new Error('ExpectedHtlcRefundConfirmed');
      }
    });

    // No utxos are left at the shared address
    const scan = await getSharedUtxos({
      network,
      address: address.address,
      lnd: client.lnd,
      min_height: start.current_block_height,
    });

    deepEqual(scan.utxos, [], 'The HTLC transaction spent the shared utxo');
  } catch (err) {
    equal(err, null, 'Expected no error');
  } finally {
    service.close();

    swapServer.stop();

    await kill({});
  }

  return;
});

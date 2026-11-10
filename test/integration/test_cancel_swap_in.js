const {equal} = require('node:assert').strict;
const {rejects} = require('node:assert').strict;
const test = require('node:test');

const asyncEachSeries = require('async/eachSeries');
const asyncRetry = require('async/retry');
const {componentsOfTransaction} = require('@alexbosworth/blockchain');
const {createInvoice} = require('ln-service');
const {getChainTransactions} = require('ln-service');
const {getHeight} = require('ln-service');
const {getPublicKey} = require('ln-service');
const {sendToChainOutputScripts} = require('ln-service');
const {spawnLightningCluster} = require('ln-docker-daemons');

const {broadcastTransaction} = require('./../../');
const {cancelSwapIn} = require('./../../');
const {createSharedAddress} = require('./../../');
const {createSwapIn} = require('./../../');
const {lightningLabsSwapAuth} = require('./../../');
const {lightningLabsSwapService} = require('./../../');
const {sharedAddressScript} = require('./../../');
const {signSwapInServiceFallback} = require('./../../');
const {staticAddressSwapServer} = require('./../macros');
const {waitForSameChainTip} = require('./../macros');

const badTerms = [
  {
    change: res => ({...res, htlc_server_pub_key: Buffer.alloc(33)}),
    error: [503, 'ExpectedValidServerHtlcKeyForSwapIn'],
    message: 'A swap with an invalid service HTLC key is refused',
  },
  {
    change: res => ({
      ...res,
      standard_htlc_info: {...res.standard_htlc_info, fee_rate: '100000'},
    }),
    error: [503, 'ExpectedLowerFallbackFeeForSwapIn'],
    message: 'A swap with an HTLC fee that is too high is refused',
  },
  {
    change: res => ({
      ...res,
      standard_htlc_info: {
        ...res.standard_htlc_info,
        nonces: res.standard_htlc_info.nonces.slice(1),
      },
    }),
    error: [503, 'ExpectedNonceForEverySwapInUtxo'],
    message: 'A swap without a nonce for every utxo is refused',
  },
];
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
const shortCltvDelta = 10;
const size = 2;
const standardFeeRate = 'standard';
const swapFee = 1000;
const times = 2000;
const tokens = 251000;
const utxosTokens = [200000, 100000];

// Canceling a swap in, for bad terms or a change of mind, frees its utxos
test(`Cancel swap in`, async () => {
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

    // The service HTLC timeouts are from the same height as the client limits
    await waitForSameChainTip({lnds});

    const height = await getHeight({lnd: client.lnd});

    // The pushes of HTLC signatures, or of no signatures, for a swap
    const pushesFor = ({id}) => {
      return swapServer.requests.pushStaticAddressHtlcSigs.filter(push => {
        return bufferAsHex(push.swap_hash) === id;
      });
    };

    // The client cancels a swap with a later HTLC timeout than it accepts
    const refusedInvoice = await createInvoice({
      lnd: client.lnd,
      tokens: tokens - swapFee,
    });

    await rejects(
      createSwapIn({
        metadata,
        service,
        utxos,
        fee: swapFee,
        max_timeout_height: height.current_block_height + shortCltvDelta,
        request: refusedInvoice.request,
      }),
      [503, 'ExpectedLowerHtlcTimeoutForSwapIn'],
      'A swap with an HTLC timeout that is too late is refused'
    );

    const [refusedPush] = pushesFor({id: refusedInvoice.id});

    equal(!!refusedPush, true, 'A refused swap is canceled with the service');
    equal(refusedPush.standard_htlc_info, null, 'Swap cancel has no sigs');

    // Swaps where the service gives other bad terms are refused and canceled
    await asyncEachSeries(badTerms, async ({change, error, message}) => {
      swapServer.changeNextSwapResponse(change);

      const badInvoice = await createInvoice({
        lnd: client.lnd,
        tokens: tokens - swapFee,
      });

      await rejects(
        createSwapIn({
          metadata,
          service,
          utxos,
          fee: swapFee,
          max_timeout_height: height.current_block_height + maxCltvDelta,
          request: badInvoice.request,
        }),
        error,
        message
      );

      const pushes = pushesFor({id: badInvoice.id});

      equal(pushes.length, 1, 'A swap with bad terms is canceled');
      equal(pushes[0].standard_htlc_info, null, 'Cancel has no signatures');

      return;
    });

    // Make a swap and then cancel it before signing its HTLC transactions
    const canceledInvoice = await createInvoice({
      lnd: client.lnd,
      tokens: tokens - swapFee,
    });

    const canceled = await createSwapIn({
      metadata,
      service,
      utxos,
      fee: swapFee,
      max_timeout_height: height.current_block_height + maxCltvDelta,
      request: canceledInvoice.request,
    });

    await cancelSwapIn({metadata, service, id: canceled.id});

    const [cancelPush] = pushesFor({id: canceled.id});

    equal(cancelPush.standard_htlc_info, null, 'Canceling pushes no sigs');

    // The canceled swap can't be signed anymore
    await rejects(
      signSwapInServiceFallback({
        expiry,
        metadata,
        network,
        service,
        utxos,
        fallbacks: canceled.fallbacks,
        id: canceled.id,
        key_family: family,
        key_index: clientKey.index,
        lnd: client.lnd,
        script: canceled.script,
        service_public_key: address.service_public_key,
        tokens: canceled.tokens,
      }),
      [503, 'UnexpectedErrorPushingFallbackSigs'],
      'The service refuses signatures for a canceled swap'
    );

    // The utxos of the canceled swaps go into a new swap
    const invoice = await createInvoice({
      lnd: client.lnd,
      tokens: tokens - swapFee,
    });

    const swap = await createSwapIn({
      metadata,
      service,
      utxos,
      fee: swapFee,
      max_timeout_height: height.current_block_height + maxCltvDelta,
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

    const htlcs = swapServer.htlcs({id: swap.id});

    const htlc = htlcs.find(n => n.type === standardFeeRate);

    // The HTLC transaction of the new swap can spend the utxos
    await broadcastTransaction({
      lnd: client.lnd,
      transaction: htlc.transaction,
    });

    const [htlcInput] = componentsOfTransaction({
      transaction: htlc.transaction,
    }).inputs;

    equal(htlcInput.id, funding.id, 'New swap spends the canceled swap utxos');
  } catch (err) {
    equal(err, null, 'Expected no error');
  } finally {
    service.close();

    swapServer.stop();

    await kill({});
  }

  return;
});

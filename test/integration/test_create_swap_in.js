const {deepEqual} = require('node:assert').strict;
const {equal} = require('node:assert').strict;
const test = require('node:test');

const asyncEachSeries = require('async/eachSeries');
const asyncRetry = require('async/retry');
const {componentsOfTransaction} = require('@alexbosworth/blockchain');
const {createChainAddress} = require('ln-service');
const {createInvoice} = require('ln-service');
const {getChainTransactions} = require('ln-service');
const {getHeight} = require('ln-service');
const {getPublicKey} = require('ln-service');
const {getUtxos} = require('ln-service');
const {idForTransaction} = require('@alexbosworth/blockchain');
const {outputScriptForAddress} = require('@alexbosworth/blockchain');
const {pay} = require('ln-service');
const {sendToChainOutputScripts} = require('ln-service');
const {setupChannel} = require('ln-docker-daemons');
const {spawnLightningCluster} = require('ln-docker-daemons');

const {broadcastTransaction} = require('./../../');
const {claimTransaction} = require('./../../');
const {createSharedAddress} = require('./../../');
const {createSwapIn} = require('./../../');
const {getSharedUtxos} = require('./../../');
const {getSwapInQuote} = require('./../../');
const {getSwapInTerms} = require('./../../');
const {lightningLabsSwapAuth} = require('./../../');
const {lightningLabsSwapService} = require('./../../');
const {sharedAddressScript} = require('./../../');
const {signSwapInServiceFallback} = require('./../../');
const {staticAddressSwapServer} = require('./../macros');
const swapKey = require('./../../script/get_public_key');
const {waitForSameChainTip} = require('./../macros');

const bufferAsHex = buffer => buffer.toString('hex');
const claimAttempts = 10;
const cltvDelta = 50;
const expiry = 14400;
const family = 42060;
const feeRate = 2;
const feeRateTypes = ['standard', 'high', 'extreme'];
const interval = 10;
const macaroon = Buffer.from('macaroon').toString('base64');
const maturity = 100;
const maxCltvDelta = 60;
const maxSwapTokens = 1e6;
const minSwapTokens = 25e4;
const network = 'btcregtest';
const outpoint = n => `${n.transaction_id}:${n.transaction_vout}`;
const preimage = Buffer.alloc(32).toString('hex');
const size = 2;
const sumOf = utxos => utxos.reduce((sum, n) => sum + n.tokens, 0);
const swapFee = 1000;
const times = 2000;
const tokens = 251000;
const utxosTokens = [200000, 100000];

// Swap in HTLC transactions can be fee bumped and claimed once paid
test(`Create swap in`, async () => {
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
    max_tokens: maxSwapTokens,
    min_tokens: minSwapTokens,
  });

  const {metadata} = lightningLabsSwapAuth({macaroon, preimage});

  const {service} = lightningLabsSwapService({
    network,
    cert: swapServer.cert,
    socket: swapServer.socket,
  });

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

    equal(address.address, shared.address, 'Got the shared address');
    equal(address.expiry, expiry, 'Got the shared address expiry');

    const start = await getHeight({lnd: client.lnd});

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

    // The service gives the limits of the tokens of a swap
    const terms = await getSwapInTerms({metadata, service});

    equal(terms.max_tokens, maxSwapTokens, 'Got the maximum swap tokens');
    equal(terms.min_tokens, minSwapTokens, 'Got the minimum swap tokens');

    const quote = await getSwapInQuote({
      metadata,
      service,
      tokens,
      utxos_count: utxos.length,
    });

    const [quoteRequest] = swapServer.requests.loopInQuote;

    equal(quoteRequest.amt, String(tokens), 'Quote is for the swap tokens');
    equal(quoteRequest.num_static_address_deposits, utxos.length, 'Utxos');

    // The client is paid for the swap with a payment to its invoice
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
      max_timeout_height: height.current_block_height + maxCltvDelta,
      request: invoice.request,
    });

    const [request] = swapServer.requests.serverStaticAddressLoopIn;

    const refundKey = swapKey({private_key: swap.private_key}).public_key;

    const outpoints = utxos.map(outpoint);

    deepEqual(request.deposit_outpoints, outpoints, 'Utxos in order');
    equal(request.amount, String(tokens), 'Service gets the swap tokens');
    equal(bufferAsHex(request.htlc_client_pub_key), refundKey, 'Refund key');
    equal(bufferAsHex(request.swap_hash), invoice.id, 'Got the swap hash');
    equal(request.swap_invoice, invoice.request, 'Got the swap invoice');
    equal(swap.id, invoice.id, 'Swap hash is the invoice hash');
    equal(swap.tokens, tokens, 'Swap is for the swap tokens');

    // Sign the HTLC transactions that the service can publish
    const signed = await signSwapInServiceFallback({
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

    // The service makes the same HTLC transactions with the same fees
    signed.transactions.forEach(({id, type}) => {
      const {fee} = swap.fallbacks.find(n => n.type === type);
      const htlc = htlcs.find(n => n.type === type);

      equal(htlc.id, id, `Service has the ${type} fee rate HTLC transaction`);
      equal(htlc.fee, fee, `Client has the ${type} fee rate HTLC fee`);
    });

    // The service pays the swap once the channel is ready to use
    const paid = await asyncRetry({interval, times}, async () => {
      return await pay({lnd: server.lnd, request: invoice.request});
    });

    // The service has the client blocks before it publishes and mines
    await waitForSameChainTip({lnds});

    // The service publishes the HTLC and then replaces it at higher fee rates
    await asyncEachSeries(feeRateTypes, async type => {
      const {transaction} = htlcs.find(n => n.type === type);

      return await broadcastTransaction({transaction, lnd: server.lnd});
    });

    const extreme = htlcs.find(n => n.type === 'extreme');

    const htlcScript = outputScriptForAddress({
      network,
      address: swap.address,
    });

    const htlcTx = componentsOfTransaction({transaction: extreme.transaction});

    const changeVout = htlcTx.outputs.findIndex(output => {
      return output.script === shared.output_script;
    });

    const htlcVout = htlcTx.outputs.findIndex(output => {
      return output.script === htlcScript.script;
    });

    const htlcTokens = htlcTx.outputs[htlcVout].tokens;

    equal(htlcTokens, tokens - extreme.fee, 'HTLC pays tokens less the fee');

    equal(
      htlcTx.outputs[changeVout].tokens,
      sumOf(utxos) - tokens,
      'HTLC transaction change goes back to the shared address'
    );

    // The service claims the HTLC with the preimage of the swap payment
    const claim = claimTransaction({
      network,
      block_height: (await getHeight({lnd: server.lnd})).current_block_height,
      fee_tokens_per_vbyte: feeRate,
      private_key: swapServer.htlc_private_key,
      secret: paid.secret,
      sweep_address: (await createChainAddress({lnd: server.lnd})).address,
      tokens: htlcTokens,
      transaction_id: extreme.id,
      transaction_vout: htlcVout,
      witness_script: swap.script,
    });

    // The HTLC claim path needs a confirmation, so mine the HTLC first
    await asyncRetry({interval, times: claimAttempts}, async () => {
      await server.generate({});

      return await broadcastTransaction({
        lnd: server.lnd,
        transaction: claim.transaction,
      });
    });

    const claimId = idForTransaction({transaction: claim.transaction}).id;

    // Wait for the claim to confirm
    await asyncRetry({interval, times}, async () => {
      await server.generate({});

      const {utxos} = await getUtxos({lnd: server.lnd});

      const utxo = utxos.find(n => n.transaction_id === claimId);

      if (!utxo || !utxo.confirmation_count) {
        throw new Error('ExpectedHtlcClaimConfirmed');
      }
    });

    // The swap utxos are spent and the HTLC transaction change is left
    await asyncRetry({interval, times}, async () => {
      const {utxos} = await getSharedUtxos({
        network,
        address: address.address,
        lnd: client.lnd,
        min_height: start.current_block_height,
      });

      // The client sees the HTLC transaction spend the swap utxos
      if (utxos.some(n => n.transaction_id === funding.id)) {
        throw new Error('ExpectedSwapUtxosSpentByHtlcTransaction');
      }

      deepEqual(
        utxos.map(outpoint),
        [outpoint({transaction_id: extreme.id, transaction_vout: changeVout})],
        'The HTLC transaction change is the only utxo left'
      );
    });
  } catch (err) {
    equal(err, null, 'Expected no error');
  } finally {
    service.close();

    swapServer.stop();

    await kill({});
  }

  return;
});

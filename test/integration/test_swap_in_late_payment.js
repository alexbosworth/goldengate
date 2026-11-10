const {equal} = require('node:assert').strict;
const {rejects} = require('node:assert').strict;
const test = require('node:test');

const asyncEachSeries = require('async/eachSeries');
const asyncRetry = require('async/retry');
const {componentsOfTransaction} = require('@alexbosworth/blockchain');
const {createChainAddress} = require('ln-service');
const {createInvoice} = require('ln-service');
const {getChainTransactions} = require('ln-service');
const {getHeight} = require('ln-service');
const {getInvoice} = require('ln-service');
const {getPublicKey} = require('ln-service');
const {getUtxos} = require('ln-service');
const {idForTransaction} = require('@alexbosworth/blockchain');
const {pay} = require('ln-service');
const {sendToChainOutputScripts} = require('ln-service');
const {setupChannel} = require('ln-docker-daemons');
const {spawnLightningCluster} = require('ln-docker-daemons');

const {broadcastTransaction} = require('./../../');
const {claimTransaction} = require('./../../');
const {createSharedAddress} = require('./../../');
const {createSwapIn} = require('./../../');
const {lightningLabsSwapAuth} = require('./../../');
const {lightningLabsSwapService} = require('./../../');
const {sharedAddressScript} = require('./../../');
const {signSwapInFallbackRefund} = require('./../../');
const {signSwapInServiceFallback} = require('./../../');
const {staticAddressSwapServer} = require('./../macros');
const {waitForSameChainTip} = require('./../macros');

const cltvDelta = 50;
const expiry = 14400;
const family = 42060;
const feeRate = 2;
const htlcKeyFamily = 99;
const interval = 10;
const macaroon = Buffer.from('macaroon').toString('base64');
const maturity = 100;
const {max} = Math;
const maxCltvDelta = 60;
const network = 'btcregtest';
const preimage = Buffer.alloc(32).toString('hex');
const size = 2;
const standardFeeRate = 'standard';
const swapFee = 1000;
const times = 2000;
const utxosTokens = {claimed: 150000, refunded: 130000};

// A late payment races claim and refund, the client is whole either way
test(`Swap in paid late`, async () => {
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

    const values = [utxosTokens.claimed, utxosTokens.refunded];

    // Make a utxo to the shared address for each of two swaps
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

    // The service knows about the utxos sent to the shared address
    swapServer.addUtxos({utxos: values.map(utxoFor)});

    // The service HTLC timeouts are from the same height as the client limits
    await waitForSameChainTip({lnds});

    const height = await getHeight({lnd: client.lnd});

    // Make a signed swap of all of a utxo, with an HTLC refund key of the LND
    const makeSwap = async ({value}) => {
      const utxos = [utxoFor(value)];

      const key = await getPublicKey({family: htlcKeyFamily, lnd: client.lnd});

      const invoice = await createInvoice({
        lnd: client.lnd,
        tokens: value - swapFee,
      });

      const swap = await createSwapIn({
        metadata,
        service,
        utxos,
        fee: swapFee,
        max_timeout_height: height.current_block_height + maxCltvDelta,
        public_key: key.public_key,
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

      // Without change the HTLC is the only output of the HTLC transaction
      const [output] = componentsOfTransaction({
        transaction: htlc.transaction,
      }).outputs;

      // The client signs the refund of the HTLC for after it times out
      const refund = await signSwapInFallbackRefund({
        network,
        fee_tokens_per_vbyte: feeRate,
        hash: swap.id,
        key_family: htlcKeyFamily,
        key_index: key.index,
        lnd: client.lnd,
        service_public_key: swap.service_public_key,
        sweep_address: (await createChainAddress({lnd: client.lnd})).address,
        timeout: swap.timeout,
        utxos: [{
          tokens: output.tokens,
          transaction_id: htlc.id,
          transaction_vout: Number(),
        }],
      });

      return {htlc, invoice, refund, swap, tokens: output.tokens};
    };

    const claimed = await makeSwap({value: utxosTokens.claimed});
    const refunded = await makeSwap({value: utxosTokens.refunded});

    // The service claims an HTLC with the preimage of the swap payment
    const claimTx = async ({htlc, secret, swap, tokens}) => {
      const tip = await getHeight({lnd: server.lnd});

      return claimTransaction({
        network,
        secret,
        tokens,
        block_height: tip.current_block_height,
        fee_tokens_per_vbyte: feeRate,
        private_key: swapServer.htlc_private_key,
        sweep_address: (await createChainAddress({lnd: server.lnd})).address,
        transaction_id: htlc.id,
        transaction_vout: Number(),
        witness_script: swap.script,
      });
    };

    // The service has the client blocks before it publishes and mines
    await waitForSameChainTip({lnds});

    // The service publishes the HTLCs but it does not pay the swaps yet
    await asyncEachSeries([claimed, refunded], async ({htlc}) => {
      return await broadcastTransaction({
        lnd: server.lnd,
        transaction: htlc.transaction,
      });
    });

    const timeout = max(claimed.swap.timeout, refunded.swap.timeout);

    // The service mines until the HTLCs time out
    await asyncRetry({interval, times}, async () => {
      await server.generate({});

      const tip = await getHeight({lnd: server.lnd});

      if (tip.current_block_height < timeout) {
        throw new Error('ExpectedHtlcsTimedOut');
      }
    });

    // The service pays the first swap late and claims before the refund
    const paid = await asyncRetry({interval, times}, async () => {
      return await pay({lnd: server.lnd, request: claimed.invoice.request});
    });

    const claim = await claimTx({...claimed, secret: paid.secret});

    await broadcastTransaction({
      lnd: server.lnd,
      transaction: claim.transaction,
    });

    const claimId = idForTransaction({transaction: claim.transaction}).id;

    // Wait for the claim to confirm
    await asyncRetry({interval, times}, async () => {
      await server.generate({});

      const wallet = await getUtxos({lnd: server.lnd});

      const utxo = wallet.utxos.find(n => n.transaction_id === claimId);

      if (!utxo || !utxo.confirmation_count) {
        throw new Error('ExpectedHtlcClaimConfirmed');
      }
    });

    // The client has the service blocks before it publishes and mines
    await waitForSameChainTip({lnds});

    // The client refund of the claimed HTLC is too late
    await rejects(
      broadcastTransaction({
        lnd: client.lnd,
        transaction: claimed.refund.transaction,
      }),
      'The refund of an HTLC that the service claimed is invalid'
    );

    const claimedSwap = await getInvoice({
      id: claimed.swap.id,
      lnd: client.lnd,
    });

    equal(claimedSwap.is_confirmed, true, 'Client is paid for a claimed HTLC');

    // The client refunds the HTLC of the second swap before it is paid
    await broadcastTransaction({
      lnd: client.lnd,
      transaction: refunded.refund.transaction,
    });

    // Wait for the refund to confirm
    await asyncRetry({interval, times}, async () => {
      await client.generate({});

      const wallet = await getUtxos({lnd: client.lnd});

      const refundId = refunded.refund.id;

      const utxo = wallet.utxos.find(n => n.transaction_id === refundId);

      if (!utxo || !utxo.confirmation_count) {
        throw new Error('ExpectedHtlcRefundConfirmed');
      }
    });

    // The service has the client blocks before it publishes
    await waitForSameChainTip({lnds});

    // The service pays the second swap late too, then its claim is too late
    const latePaid = await asyncRetry({interval, times}, async () => {
      return await pay({lnd: server.lnd, request: refunded.invoice.request});
    });

    const lateClaim = await claimTx({...refunded, secret: latePaid.secret});

    await rejects(
      broadcastTransaction({
        lnd: server.lnd,
        transaction: lateClaim.transaction,
      }),
      'The claim of an HTLC that the client refunded is invalid'
    );

    const refundedSwap = await getInvoice({
      id: refunded.swap.id,
      lnd: client.lnd,
    });

    equal(refundedSwap.is_confirmed, true, 'Client is paid for a refund too');
  } catch (err) {
    equal(err, null, 'Expected no error');
  } finally {
    service.close();

    swapServer.stop();

    await kill({});
  }

  return;
});

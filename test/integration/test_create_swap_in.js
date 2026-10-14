const {equal} = require('node:assert').strict;
const test = require('node:test');

const asyncRetry = require('async/retry');
const {componentsOfTransaction} = require('@alexbosworth/blockchain');
const {createChainAddress} = require('ln-service');
const {createInvoice} = require('ln-service');
const {getChainTransactions} = require('ln-service');
const {getHeight} = require('ln-service');
const {getUtxos} = require('ln-service');
const {outputScriptForAddress} = require('@alexbosworth/blockchain');
const {sendToChainAddresses} = require('ln-service');
const {spawnLightningCluster} = require('ln-docker-daemons');

const {addressForScript} = require('./../../');
const {broadcastTransaction} = require('./../../');
const {createSwapIn} = require('./../../');
const {getPublicKey} = require('./../../script');
const {makePrivateKey} = require('./../../script');
const {refundTransaction} = require('./../../');
const {swapScriptV2} = require('./../../');

const bufferAsHex = buffer => buffer.toString('hex');
const cltvDelta = 20;
const fee = 1000;
const feeRate = 2;
const hexAsBuffer = hex => Buffer.from(hex, 'hex');
const interval = 10;
const maturity = 100;
const maxCltvDelta = 1000;
const network = 'btcregtest';
const scriptFor = address => outputScriptForAddress({address, network}).script;
const times = 2000;
const tokens = 1e6;

// Creating a swap in should give a swap that the client can refund
test(`Create swap in`, async () => {
  const {kill, nodes} = await spawnLightningCluster({});

  const [{generate, lnd}] = nodes;

  try {
    await generate({count: maturity});

    const height = (await getHeight({lnd})).current_block_height;
    const serverKey = makePrivateKey({}).private_key;

    const serverPublicKey = getPublicKey({private_key: serverKey}).public_key;
    const swapHtlcs = {};
    const timeout = height + cltvDelta;

    // The server makes the swap HTLC from the swap request
    const service = {
      newLoopInSwap: (req, {}, cbk) => {
        const {script} = swapScriptV2({
          timeout,
          claim_public_key: serverPublicKey,
          hash: bufferAsHex(req.swap_hash),
          refund_public_key: bufferAsHex(req.sender_key),
        });

        const {address} = addressForScript({network, script});

        swapHtlcs[bufferAsHex(req.swap_hash)] = address;

        return cbk(null, {
          expiry: timeout,
          receiver_key: hexAsBuffer(serverPublicKey),
        });
      },
    };

    const clientKey = makePrivateKey({}).private_key;

    const clientPublicKey = getPublicKey({private_key: clientKey}).public_key;

    // Make invoices for the server to pay
    const invoice = await createInvoice({lnd, tokens});
    const keyInvoice = await createInvoice({lnd, tokens});

    // Create a swap with a new refund key
    const swap = await createSwapIn({
      fee,
      service,
      max_timeout_height: height + maxCltvDelta,
      metadata: {},
      request: invoice.request,
    });

    // Create a swap with the client public key
    const keySwap = await createSwapIn({
      fee,
      service,
      max_timeout_height: height + maxCltvDelta,
      metadata: {},
      public_key: clientPublicKey,
      request: keyInvoice.request,
    });

    equal(!!keySwap.private_key, false, 'Swap has no private key');

    // Swaps should pay to the server HTLCs
    equal(swap.address, swapHtlcs[invoice.id], 'Swap pays to HTLC');
    equal(keySwap.address, swapHtlcs[keyInvoice.id], 'Key swap pays to HTLC');

    // Fund the swap HTLCs
    const {id} = await sendToChainAddresses({
      lnd,
      send_to: [
        {address: swapHtlcs[invoice.id], tokens: swap.tokens},
        {address: swapHtlcs[keyInvoice.id], tokens: keySwap.tokens},
      ],
    });

    // Confirm the funding and mine to the swap timeout
    const funding = await asyncRetry({interval, times}, async () => {
      await generate({});

      const chainTip = await getHeight({lnd});
      const {transactions} = await getChainTransactions({lnd});

      const tx = transactions.find(n => n.id === id);

      if (!tx || !tx.is_confirmed) {
        throw new Error('ExpectedSwapFundingConfirmed');
      }

      if (chainTip.current_block_height < timeout) {
        throw new Error('ExpectedSwapTimeoutReached');
      }

      return tx;
    });

    const sweepAddress = (await createChainAddress({lnd})).address;

    const {outputs} = componentsOfTransaction({
      transaction: funding.transaction,
    });

    const scripts = outputs.map(n => n.script);

    // Refund the swap with its refund key
    const refund = refundTransaction({
      network,
      block_height: swap.timeout,
      fee_tokens_per_vbyte: feeRate,
      private_key: swap.private_key,
      sweep_address: sweepAddress,
      tokens: swap.tokens,
      transaction_id: id,
      transaction_vout: scripts.indexOf(scriptFor(swap.address)),
      witness_script: swap.script,
    });

    const refunded = await broadcastTransaction({
      lnd,
      transaction: refund.transaction,
    });

    // Refund the key swap with the client key
    const keyRefund = refundTransaction({
      network,
      block_height: keySwap.timeout,
      fee_tokens_per_vbyte: feeRate,
      private_key: clientKey,
      sweep_address: sweepAddress,
      tokens: keySwap.tokens,
      transaction_id: id,
      transaction_vout: scripts.indexOf(scriptFor(keySwap.address)),
      witness_script: keySwap.script,
    });

    const keyRefunded = await broadcastTransaction({
      lnd,
      transaction: keyRefund.transaction,
    });

    // Wait for the refunds to confirm
    await asyncRetry({interval, times}, async () => {
      await generate({});

      const {utxos} = await getUtxos({lnd});

      const confirmed = utxos.filter(n => !!n.confirmation_count);

      const ids = confirmed.map(n => n.transaction_id);

      if (!ids.includes(refunded.transaction_id)) {
        throw new Error('ExpectedSwapRefundConfirmed');
      }

      if (!ids.includes(keyRefunded.transaction_id)) {
        throw new Error('ExpectedPublicKeySwapRefundConfirmed');
      }
    });
  } catch (err) {
    equal(err, null, 'Expected no error');
  } finally {
    await kill({});
  }

  return;
});

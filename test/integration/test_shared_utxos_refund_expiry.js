const {equal} = require('node:assert').strict;
const {rejects} = require('node:assert').strict;
const test = require('node:test');

const asyncRetry = require('async/retry');
const {componentsOfTransaction} = require('@alexbosworth/blockchain');
const {createChainAddress} = require('ln-service');
const {getChainTransactions} = require('ln-service');
const {getHeight} = require('ln-service');
const {getPublicKey} = require('ln-service');
const {getUtxos} = require('ln-service');
const {sendToChainOutputScripts} = require('ln-service');
const {spawnLightningCluster} = require('ln-docker-daemons');

const {broadcastTransaction} = require('./../../');
const {makePrivateKey} = require('./../../script');
const {sharedAddressScript} = require('./../../');
const {signSharedUtxosRefund} = require('./../../');
const swapKey = require('./../../script/get_public_key');

const blocksApart = 3;
const expiry = 40;
const family = 42060;
const feeRate = 2;
const interval = 10;
const maturity = 100;
const network = 'btcregtest';
const times = 2000;
const utxosTokens = {early: 200000, late: 100000};

// A refund of utxos from different heights is valid once all are expired
test(`Refund shared address utxos once they are all expired`, async () => {
  const {kill, nodes} = await spawnLightningCluster({});

  const [{generate, lnd}] = nodes;

  try {
    await generate({count: maturity});

    const clientKey = await getPublicKey({family, lnd});
    const serverKey = swapKey({private_key: makePrivateKey({}).private_key});

    const address = sharedAddressScript({
      expiry,
      network,
      client_public_key: clientKey.public_key,
      server_public_key: serverKey.public_key,
    });

    // Send a utxo to the shared address and wait for it to confirm
    const sendUtxo = async tokens => {
      const funding = await sendToChainOutputScripts({
        lnd,
        fee_tokens_per_vbyte: feeRate,
        send_to: [{tokens, script: address.output_script}],
      });

      const confirmed = await asyncRetry({interval, times}, async () => {
        await generate({});

        const {transactions} = await getChainTransactions({lnd});

        const tx = transactions.find(n => n.id === funding.id);

        if (!tx || !tx.is_confirmed) {
          throw new Error('ExpectedSharedUtxoConfirmed');
        }

        return tx;
      });

      const {outputs} = componentsOfTransaction({
        transaction: funding.transaction,
      });

      return {
        tokens,
        confirmation_height: confirmed.confirmation_height,
        transaction_id: funding.id,
        transaction_vout: outputs.findIndex(output => {
          return output.script === address.output_script;
        }),
      };
    };

    // Mine blocks until the chain tip is at a height
    const mineTo = async height => {
      const tip = await getHeight({lnd});

      equal(tip.current_block_height <= height, true, 'Not past the height');

      if (tip.current_block_height < height) {
        await generate({count: height - tip.current_block_height});
      }

      // Wait for the node to have the blocks
      await asyncRetry({interval, times}, async () => {
        const {current_block_height} = await getHeight({lnd});

        if (current_block_height !== height) {
          throw new Error('ExpectedChainTipAtHeight');
        }
      });
    };

    // Make a utxo and then another utxo a few blocks later
    const early = await sendUtxo(utxosTokens.early);

    await generate({count: blocksApart});

    const late = await sendUtxo(utxosTokens.late);

    equal(
      late.confirmation_height > early.confirmation_height,
      true,
      'The utxos confirmed at different heights'
    );

    const refund = await signSharedUtxosRefund({
      expiry,
      lnd,
      network,
      fee_tokens_per_vbyte: feeRate,
      key_family: family,
      key_index: clientKey.index,
      service_public_key: serverKey.public_key,
      sweep_address: (await createChainAddress({lnd})).address,
      utxos: [early, late],
    });

    // The timeout path of a utxo can be spent in blocks from its expiry height
    const expiryHeight = utxo => utxo.confirmation_height + expiry;

    // Mine to where the next block can spend the early utxo but not the late
    await mineTo(expiryHeight(late) - 2);

    equal(
      expiryHeight(early) < expiryHeight(late) - 1,
      true,
      'The next block is past the expiry height of the early utxo'
    );

    // The refund is not valid while the late utxo is not expired
    await rejects(
      broadcastTransaction({lnd, transaction: refund.transaction}),
      'The refund waits for every utxo to expire'
    );

    // The same refund is valid when the next block is the late expiry height
    await mineTo(expiryHeight(late) - 1);

    await broadcastTransaction({lnd, transaction: refund.transaction});

    // Wait for the refund to confirm
    const received = await asyncRetry({interval, times}, async () => {
      await generate({});

      const {utxos} = await getUtxos({lnd});

      const utxo = utxos.find(n => n.transaction_id === refund.id);

      if (!utxo || !utxo.confirmation_count) {
        throw new Error('ExpectedRefundConfirmed');
      }

      return utxo;
    });

    const [output] = componentsOfTransaction({
      transaction: refund.transaction,
    }).outputs;

    equal(received.tokens, output.tokens, 'Client received the refund');
  } catch (err) {
    equal(err, null, 'Expected no error');
  } finally {
    await kill({});
  }

  return;
});

const {equal} = require('node:assert').strict;
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
const {sharedAddressScript} = require('./../../');
const {signSharedUtxosRefund} = require('./../../');

const expiry = 20;
const family = 42060;
const feeRate = 2;
const interval = 10;
const maturity = 100;
const network = 'btcregtest';
const size = 2;
const times = 2000;

// Expired shared address utxos should be refunded through the timeout path
test(`Sign shared address utxos refund`, async () => {
  const {kill, nodes} = await spawnLightningCluster({size});

  const [client, server] = nodes;

  try {
    await client.generate({count: maturity});

    const clientKey = await getPublicKey({family, lnd: client.lnd});
    const serverKey = await getPublicKey({family, lnd: server.lnd});

    const address = sharedAddressScript({
      expiry,
      network,
      client_public_key: clientKey.public_key,
      server_public_key: serverKey.public_key,
    });

    // Make two utxos to the shared address
    const funding = await sendToChainOutputScripts({
      fee_tokens_per_vbyte: feeRate,
      lnd: client.lnd,
      send_to: [
        {script: address.output_script, tokens: 200000},
        {script: address.output_script, tokens: 100000},
      ],
    });

    // Wait for the utxos to confirm
    const confirmed = await asyncRetry({interval, times}, async () => {
      await client.generate({});

      const {transactions} = await getChainTransactions({lnd: client.lnd});

      const tx = transactions.find(n => n.id === funding.id);

      if (!tx || !tx.is_confirmed) {
        throw new Error('ExpectedSharedUtxosConfirmed');
      }

      return tx;
    });

    const {outputs} = componentsOfTransaction({
      transaction: funding.transaction,
    });

    const utxos = [200000, 100000].map(value => ({
      tokens: value,
      transaction_id: funding.id,
      transaction_vout: outputs.findIndex(output => {
        const isShared = output.script === address.output_script;

        return isShared && output.tokens === value;
      }),
    }));

    const {address: sweepAddress} = await createChainAddress({
      lnd: client.lnd,
    });

    const refund = await signSharedUtxosRefund({
      utxos,
      expiry,
      network,
      fee_tokens_per_vbyte: feeRate,
      key_family: family,
      key_index: clientKey.index,
      lnd: client.lnd,
      service_public_key: serverKey.public_key,
      sweep_address: sweepAddress,
    });

    // The refund can be published once the utxos have expiry confirmations
    const expiryHeight = confirmed.confirmation_height + expiry - 1;

    const start = await getHeight({lnd: client.lnd});

    const remaining = expiryHeight - start.current_block_height;

    if (remaining > 0) {
      await client.generate({count: remaining});
    }

    // Wait for the client to see the blocks before publishing the refund
    await asyncRetry({interval, times}, async () => {
      const height = await getHeight({lnd: client.lnd});

      if (height.current_block_height < expiryHeight) {
        throw new Error('ExpectedUtxosExpired');
      }
    });

    await broadcastTransaction({
      lnd: client.lnd,
      transaction: refund.transaction,
    });

    // Wait for the refund to confirm
    const received = await asyncRetry({interval, times}, async () => {
      await client.generate({});

      const {utxos} = await getUtxos({lnd: client.lnd});

      const utxo = utxos.find(n => n.transaction_id === refund.id);

      if (!utxo || !utxo.confirmation_count) {
        throw new Error('ExpectedRefundConfirmed');
      }

      return utxo;
    });

    const [output] = componentsOfTransaction({
      transaction: refund.transaction,
    }).outputs;

    equal(received.tokens, output.tokens, 'Client received refund tokens');
  } catch (err) {
    equal(err, null, 'Expected no error');
  } finally {
    await kill({});
  }

  return;
});

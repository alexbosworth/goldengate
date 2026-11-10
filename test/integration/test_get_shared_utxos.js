const {deepEqual} = require('node:assert').strict;
const {equal} = require('node:assert').strict;
const test = require('node:test');

const asyncRetry = require('async/retry');
const {componentsOfTransaction} = require('@alexbosworth/blockchain');
const {createChainAddress} = require('ln-service');
const {getChainTransactions} = require('ln-service');
const {getHeight} = require('ln-service');
const {getPublicKey} = require('ln-service');
const {sendToChainOutputScripts} = require('ln-service');
const {spawnLightningCluster} = require('ln-docker-daemons');

const {broadcastTransaction} = require('./../../');
const {getSharedUtxos} = require('./../../');
const {sharedAddressScript} = require('./../../');
const {signSharedUtxosRefund} = require('./../../');

const blockstreamApi = 'https://blockstream.info/regtest/api';
const byVout = (a, b) => a.transaction_vout - b.transaction_vout;
const expiry = 3;
const family = 42060;
const feeRate = 2;
const flatten = arr => [].concat(...arr);
const interval = 10;
const maturity = 100;
const network = 'btcregtest';
const notFoundCode = 404;
const okCode = 200;
const size = 2;
const times = 2000;

// Answer Blockstream API requests from the node, keeping the tips it gives
const blockstreamRequest = ({address, lnd, script, tips}) => ({url}, cbk) => {
  // The chain tip of the API is the chain tip of the node
  if (url === `${blockstreamApi}/blocks/tip/height`) {
    return getHeight({lnd}, (err, res) => {
      if (!!err) {
        return cbk(err);
      }

      const height = res.current_block_height;

      tips.push(height);

      return cbk(null, {statusCode: okCode}, String(height));
    });
  }

  // Exit early when the request is not for the utxos of the address
  if (url !== `${blockstreamApi}/address/${address}/utxo`) {
    return cbk(null, {statusCode: notFoundCode});
  }

  return getChainTransactions({lnd}, (err, res) => {
    if (!!err) {
      return cbk(err);
    }

    const txs = res.transactions.filter(tx => !!tx.transaction).map(tx => ({
      tx,
      components: componentsOfTransaction({transaction: tx.transaction}),
    }));

    // Outputs are spent by transactions in the mempool or in blocks
    const spent = flatten(txs.map(({components}) => {
      return components.inputs.map(input => `${input.id}:${input.vout}`);
    }));

    const outputs = flatten(txs.map(({components, tx}) => {
      return components.outputs.map((output, vout) => ({output, tx, vout}));
    }));

    const utxos = outputs
      .filter(({output}) => output.script === script)
      .filter(({tx, vout}) => !spent.includes(`${tx.id}:${vout}`))
      .map(({output, tx, vout}) => ({
        vout,
        status: !tx.is_confirmed ? {confirmed: false} : {
          block_height: tx.confirmation_height,
          confirmed: true,
        },
        txid: tx.id,
        value: output.tokens,
      }));

    return cbk(null, {statusCode: okCode}, utxos);
  });
};

// Utxos with their confirmations as of a chain tip height
const countedAt = (height, utxos) => utxos.map(utxo => ({
  ...utxo,
  confirmation_count: height - utxo.confirmation_height + 1,
}));

// Block scans and the Blockstream API find the unspent shared address utxos
test(`Get shared address utxos`, async () => {
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

    const start = await getHeight({lnd: client.lnd});

    // Make two utxos to the shared address
    const funding = await sendToChainOutputScripts({
      fee_tokens_per_vbyte: feeRate,
      lnd: client.lnd,
      send_to: [
        {script: address.output_script, tokens: 200000},
        {script: address.output_script, tokens: 100000},
      ],
    });

    const tips = [];

    const request = blockstreamRequest({
      tips,
      address: address.address,
      lnd: client.lnd,
      script: address.output_script,
    });

    const {outputs} = componentsOfTransaction({
      transaction: funding.transaction,
    });

    // Find the output index of a utxo by its value
    const vout = value => outputs.findIndex(({script, tokens}) => {
      return script === address.output_script && tokens === value;
    });

    // The Blockstream API has the utxos in the mempool before they confirm
    const pending = await getSharedUtxos({
      network,
      request,
      address: address.address,
    });

    deepEqual(
      pending.utxos.slice().sort(byVout),
      [200000, 100000].map(value => ({
        confirmation_count: 0,
        confirmation_height: undefined,
        tokens: value,
        transaction_id: funding.id,
        transaction_vout: vout(value),
      }))
      .sort(byVout),
      'The Blockstream API has the unconfirmed utxos'
    );

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

    const utxos = [200000, 100000].map(value => ({
      confirmation_height: confirmed.confirmation_height,
      tokens: value,
      transaction_id: funding.id,
      transaction_vout: vout(value),
    }));

    const first = await getSharedUtxos({
      network,
      address: address.address,
      lnd: client.lnd,
      min_height: start.current_block_height,
    });

    deepEqual(
      first.utxos.slice().sort(byVout),
      countedAt(first.height, utxos).sort(byVout),
      'Found the utxos'
    );

    // The Blockstream API has the same utxos as the scan of the blocks
    const found = await getSharedUtxos({
      network,
      request,
      address: address.address,
    });

    const [foundTip] = tips.slice(-1);

    deepEqual(
      found.utxos.slice().sort(byVout),
      countedAt(foundTip, utxos).sort(byVout),
      'The Blockstream API has the confirmed utxos'
    );

    // Refund the larger utxo once the utxos are expired
    await client.generate({count: expiry});

    const [larger, smaller] = utxos;

    const refund = await signSharedUtxosRefund({
      expiry,
      network,
      utxos: [larger],
      fee_tokens_per_vbyte: feeRate,
      key_family: family,
      key_index: clientKey.index,
      lnd: client.lnd,
      service_public_key: serverKey.public_key,
      sweep_address: (await createChainAddress({lnd: client.lnd})).address,
    });

    await broadcastTransaction({
      lnd: client.lnd,
      transaction: refund.transaction,
    });

    // Continue the scan until the refunded utxo is spent
    const next = await asyncRetry({interval, times}, async () => {
      await client.generate({});

      const res = await getSharedUtxos({
        network,
        address: address.address,
        id: first.id,
        utxos: first.utxos,
        lnd: client.lnd,
        min_height: first.height + 1,
      });

      if (res.utxos.length !== 1) {
        throw new Error('ExpectedRefundedUtxoSpent');
      }

      return res;
    });

    deepEqual(
      next.utxos,
      countedAt(next.height, [smaller]),
      'The refunded utxo is spent'
    );

    // The Blockstream API also has the refunded utxo as spent
    const left = await getSharedUtxos({
      network,
      request,
      address: address.address,
    });

    const [leftTip] = tips.slice(-1);

    deepEqual(
      left.utxos,
      countedAt(leftTip, [smaller]),
      'The Blockstream API has the utxo left'
    );
  } catch (err) {
    equal(err, null, 'Expected no error');
  } finally {
    await kill({});
  }

  return;
});

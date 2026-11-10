const {deepEqual} = require('node:assert').strict;
const {equal} = require('node:assert').strict;
const {rejects} = require('node:assert').strict;
const test = require('node:test');

const asyncRetry = require('async/retry');
const {authenticatedLndGrpc} = require('ln-service');
const {createChainAddress} = require('ln-service');
const {getBlockHeader} = require('ln-service');
const {getChainTransactions} = require('ln-service');
const {getHeight} = require('ln-service');
const {getPublicKey} = require('ln-service');
const {getUtxos} = require('ln-service');
const {idForBlock} = require('@alexbosworth/blockchain');
const {sendToChainOutputScripts} = require('ln-service');
const {spawnLightningDocker} = require('ln-docker-daemons');

const {addressForScript} = require('./../../');
const {getSharedUtxos} = require('./../../');
const {makePrivateKey} = require('./../../script');
const {sharedAddressScript} = require('./../../');
const swapKey = require('./../../script/get_public_key');

const anyoneCanSpendScript = '51';
const blocksAhead = 5;
const expiry = 14400;
const family = 42060;
const feeRate = 2;
const interval = 10;
const maturity = 100;
const network = 'btcregtest';
const reorgRetry = {interval: 100, times: 1200};
const spawnAttempts = 10;
const times = 2000;
const tokens = 200000;

// A reorg of scanned blocks restarts the scan without the reorged utxos
test(`Get shared utxos after a reorg`, async () => {
  // Blocks that only make the chain longer are mined to an anyone can spend
  const {address} = addressForScript({network, script: anyoneCanSpendScript});

  // Each node has a chain of its own until the chains are connected
  const spawn = () => {
    return asyncRetry({interval, times: spawnAttempts}, async () => {
      return await spawnLightningDocker({generate_address: address});
    });
  };

  const nodes = [await spawn()];

  try {
    nodes.push(await spawn());

    const [node, other] = nodes;

    const {lnd} = authenticatedLndGrpc({
      cert: node.cert,
      macaroon: node.macaroon,
      socket: node.socket,
    });

    // Mine coins to the node to send to the shared address
    await node.generate({
      address: (await createChainAddress({lnd})).address,
      count: maturity,
    });

    await asyncRetry({interval, times}, async () => {
      const {utxos} = await getUtxos({lnd});

      if (!utxos.length) {
        throw new Error('ExpectedMatureCoinsToSpend');
      }
    });

    const clientKey = await getPublicKey({family, lnd});
    const serverKey = swapKey({private_key: makePrivateKey({}).private_key});

    const shared = sharedAddressScript({
      expiry,
      network,
      client_public_key: clientKey.public_key,
      server_public_key: serverKey.public_key,
    });

    const start = await getHeight({lnd});

    // Make a utxo to the shared address
    const funding = await sendToChainOutputScripts({
      lnd,
      fee_tokens_per_vbyte: feeRate,
      send_to: [{tokens, script: shared.output_script}],
    });

    // Wait for the utxo to confirm
    await asyncRetry({interval, times}, async () => {
      await node.generate({address});

      const {transactions} = await getChainTransactions({lnd});

      const tx = transactions.find(n => n.id === funding.id);

      if (!tx || !tx.is_confirmed) {
        throw new Error('ExpectedSharedUtxoConfirmed');
      }
    });

    const scanned = await getSharedUtxos({
      lnd,
      network,
      address: shared.address,
      min_height: start.current_block_height,
    });

    deepEqual(
      scanned.utxos.map(n => n.transaction_id),
      [funding.id],
      'The scan found the utxo'
    );

    // The other node mines a chain that is longer than the scanned chain
    await other.generate({address, count: scanned.height + blocksAhead});

    // Connecting the chains reorganizes the scanned blocks out of the chain
    await node.add_chain_peer({socket: other.chain_socket});
    await other.add_chain_peer({socket: node.chain_socket});

    // Wait for the reorg, long enough to cover a peer reconnect after 60s
    await asyncRetry(reorgRetry, async () => {
      const {header} = await getBlockHeader({lnd, height: scanned.height});

      if (idForBlock({block: header}).id === scanned.id) {
        throw new Error('ExpectedScannedBlockReorganizedOut');
      }

      const tip = await getHeight({lnd});

      // The node has to know it is on the longer chain to continue the scan
      if (tip.current_block_height <= scanned.height) {
        throw new Error('ExpectedNodeTipOnTheLongerChain');
      }
    });

    // Continuing the scan through blocks that were reorganized out fails
    await rejects(
      getSharedUtxos({
        lnd,
        network,
        address: shared.address,
        id: scanned.id,
        min_height: scanned.height + 1,
        utxos: scanned.utxos,
      }),
      [409, 'UnexpectedReorgOfScannedBlocksForSharedUtxos'],
      'A reorg of scanned blocks means the scan has to start over'
    );

    // Starting the scan over does not find the utxo in the new chain
    const rescanned = await getSharedUtxos({
      lnd,
      network,
      address: shared.address,
      min_height: start.current_block_height,
    });

    deepEqual(rescanned.utxos, [], 'The reorg took the utxo out of the chain');
  } catch (err) {
    equal(err, null, 'Expected no error');
  } finally {
    await Promise.all(nodes.map(({kill}) => kill({})));
  }

  return;
});

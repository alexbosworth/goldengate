const {equal} = require('node:assert').strict;
const {randomBytes} = require('node:crypto');
const test = require('node:test');

const asyncRetry = require('async/retry');
const {broadcastChainTransaction} = require('ln-service');
const {createChainAddress} = require('ln-service');
const {createPsbt} = require('psbt');
const {fundPsbt} = require('ln-service');
const {getChainFeeRate} = require('ln-service');
const {getHeight} = require('ln-service');
const {getPublicKey} = require('ln-service');
const {getUtxos} = require('ln-service');
const {hashForTree} = require('p2tr');
const {networks} = require('bitcoinjs-lib');
const {pointAdd} = require('tiny-secp256k1');
const {signPsbt} = require('ln-service');
const {spawnLightningCluster} = require('ln-docker-daemons');
const tinysecp = require('tiny-secp256k1');
const {Transaction} = require('bitcoinjs-lib');
const {v1OutputScript} = require('p2tr');

const {swapScriptBranches} = require('./../../');
const {taprootCoopTransaction} = require('./../../');

const bufferAsHex = buffer => buffer.toString('hex');
const cltvDelta = 144;
const family = 805;
const {fromHex} = Transaction;
const hexAsBuffer = hex => Buffer.from(hex, 'hex');
const interval = 10;
const makeSecret = () => randomBytes(32);
const maturity = 100;
const networkName = 'btcregtest';
const shortKey = key => key.slice(2);
const size = 2;
const times = 2000;
const tokens = 1e6;

// Swapping in taproot cooperatively should result in a successful swap
test(`Taproot Coop Swap`, async () => {
  const ecp = (await import('ecpair')).ECPairFactory(tinysecp);
  const {kill, nodes} = await spawnLightningCluster({size});

  const [{generate, lnd}, target] = nodes;

  const clientKey = ecp.makeRandom({network: networks.regtest});
  const remoteKey = ecp.makeRandom({network: networks.regtest});

  const jointPublicKey = pointAdd(clientKey.publicKey, remoteKey.publicKey);

  const claimKey = await getPublicKey({family, lnd: target.lnd});
  const currentHeight = (await getHeight({lnd})).current_block_height;
  const refundKey = await getPublicKey({family, lnd});
  const secret = makeSecret();

  try {
    await generate({count: maturity});

    const {branches} = swapScriptBranches({
      ecp,
      claim_public_key: shortKey(claimKey.public_key),
      refund_public_key: shortKey(refundKey.public_key),
      secret: makeSecret(),
      timeout: currentHeight + cltvDelta,
    });

    const output = v1OutputScript({
      hash: hashForTree({branches}).hash,
      internal_key: Buffer.from(jointPublicKey).toString('hex'),
    });

    const [utxo] = (await getUtxos({lnd})).utxos.reverse();

    const {psbt} = createPsbt({
      outputs: [{tokens, script: output.script}],
      utxos: [{id: utxo.transaction_id, vout: utxo.transaction_vout}],
    });

    const signed = await signPsbt({
      lnd,
      psbt: (await fundPsbt({lnd, psbt})).psbt,
    });

    await broadcastChainTransaction({lnd, transaction: signed.transaction});

    const {outs} = fromHex(signed.transaction);

    const {transaction} = taprootCoopTransaction({
      ecp,
      tokens,
      fee_tokens_per_vbyte: (await getChainFeeRate({lnd})).tokens_per_vbyte,
      network: networkName,
      output_script: output.script,
      private_keys: [clientKey, remoteKey].map(n => bufferAsHex(n.privateKey)),
      script_branches: branches,
      sweep_address: (await createChainAddress({lnd: target.lnd})).address,
      transaction_id: fromHex(signed.transaction).getId(),
      transaction_vout: outs.findIndex(n => n.value === tokens),
    });

    const tx = fromHex(transaction);

    await broadcastChainTransaction({lnd, transaction: tx.toHex()});

    await asyncRetry({interval, times}, async () => {
      await generate({});

      const {utxos} = await getUtxos({lnd: target.lnd});

      const utxo = utxos.find(n => n.transaction_id === tx.getId());

      if (!utxo || !utxo.confirmation_count) {
        throw new Error('ExpectedReceivedTaprootSwapSweep');
      }
    });
  } catch (err) {
    equal(err, null, 'Expected no error');
  }

  await kill({});

  return;
});

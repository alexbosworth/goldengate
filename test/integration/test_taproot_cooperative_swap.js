const {equal} = require('node:assert').strict;
const {randomBytes} = require('node:crypto');
const test = require('node:test');

const asyncRetry = require('async/retry');
const {broadcastChainTransaction} = require('ln-service');
const {componentsOfTransaction} = require('@alexbosworth/blockchain');
const {createChainAddress} = require('ln-service');
const {createPsbt} = require('psbt');
const {fundPsbt} = require('ln-service');
const {getChainFeeRate} = require('ln-service');
const {getHeight} = require('ln-service');
const {getPublicKey} = require('ln-service');
const {getUtxos} = require('ln-service');
const {hashForTree} = require('p2tr');
const {idForTransaction} = require('@alexbosworth/blockchain');
const {outputScriptForAddress} = require('@alexbosworth/blockchain');
const {pointAdd} = require('tiny-secp256k1');
const {pointFromScalar} = require('tiny-secp256k1');
const {signPsbt} = require('ln-service');
const {spawnLightningCluster} = require('ln-docker-daemons');
const {v1OutputScript} = require('p2tr');

const {makePrivateKey} = require('./../../script');
const {swapScriptBranches} = require('./../../');
const {taprootCoopTransaction} = require('./../../');

const cltvDelta = 144;
const family = 805;
const hexAsBuffer = hex => Buffer.from(hex, 'hex');
const interval = 10;
const isCompressed = true;
const makeSecret = () => randomBytes(32);
const maturity = 100;
const network = 'btcregtest';
const sendTokens = 1e5;
const size = 2;
const times = 2000;
const tokens = 1e6;

// Swapping in taproot cooperatively should result in a successful swap
test(`Taproot Coop Swap`, async () => {
  const {kill, nodes} = await spawnLightningCluster({size});

  const [{generate, lnd}, target] = nodes;

  const clientKey = makePrivateKey({}).private_key;
  const remoteKey = makePrivateKey({}).private_key;

  const jointPublicKey = pointAdd(
    pointFromScalar(hexAsBuffer(clientKey), isCompressed),
    pointFromScalar(hexAsBuffer(remoteKey), isCompressed)
  );

  const claimKey = await getPublicKey({family, lnd: target.lnd});
  const currentHeight = (await getHeight({lnd})).current_block_height;
  const refundKey = await getPublicKey({family, lnd});

  try {
    await generate({count: maturity});

    const {branches} = swapScriptBranches({
      claim_public_key: claimKey.public_key,
      refund_public_key: refundKey.public_key,
      secret: makeSecret(),
      timeout: currentHeight + cltvDelta,
    });

    const output = v1OutputScript({
      hash: hashForTree({branches}).hash,
      internal_key: Buffer.from(jointPublicKey).toString('hex'),
    });

    // Find a confirmed coin to fund two swap outputs
    const utxo = (await getUtxos({lnd})).utxos.reverse().find(n => {
      return !!n.confirmation_count && n.tokens > 2 * tokens;
    });

    const {psbt} = createPsbt({
      outputs: [
        {tokens, script: output.script},
        {tokens, script: output.script},
      ],
      utxos: [{id: utxo.transaction_id, vout: utxo.transaction_vout}],
    });

    const signed = await signPsbt({
      lnd,
      psbt: (await fundPsbt({lnd, psbt})).psbt,
    });

    await broadcastChainTransaction({lnd, transaction: signed.transaction});

    const {outputs} = componentsOfTransaction({
      transaction: signed.transaction,
    });

    // Sweep the first swap output cooperatively
    const sweep = taprootCoopTransaction({
      network,
      tokens,
      fee_tokens_per_vbyte: (await getChainFeeRate({lnd})).tokens_per_vbyte,
      output_script: output.script,
      private_keys: [clientKey, remoteKey],
      script_branches: branches,
      sweep_address: (await createChainAddress({lnd: target.lnd})).address,
      transaction_id: idForTransaction({transaction: signed.transaction}).id,
      transaction_vout: outputs.findIndex(n => n.tokens === tokens),
    });

    const sweepId = idForTransaction({transaction: sweep.transaction}).id;

    await broadcastChainTransaction({lnd, transaction: sweep.transaction});

    // Sweep the second swap output with a send to lnd
    const {address} = await createChainAddress({lnd});

    const sendSweep = taprootCoopTransaction({
      network,
      tokens,
      fee_tokens_per_vbyte: (await getChainFeeRate({lnd})).tokens_per_vbyte,
      output_script: output.script,
      private_keys: [clientKey, remoteKey],
      script_branches: branches,
      sends: [{address, tokens: sendTokens}],
      sweep_address: (await createChainAddress({lnd: target.lnd})).address,
      transaction_id: idForTransaction({transaction: signed.transaction}).id,
      transaction_vout: outputs.findLastIndex(n => n.tokens === tokens),
    });

    const sendId = idForTransaction({transaction: sendSweep.transaction}).id;

    await broadcastChainTransaction({lnd, transaction: sendSweep.transaction});

    const sendSweepTx = componentsOfTransaction({
      transaction: sendSweep.transaction,
    });

    const sendScript = outputScriptForAddress({address, network}).script;

    const sendOutput = sendSweepTx.outputs.find(n => n.script === sendScript);

    equal(sendSweepTx.outputs.length, 2, 'Sweep has sweep and send outputs');
    equal(sendOutput.tokens, sendTokens, 'Sweep pays the send');

    // Wait for the sweeps and the send to confirm
    const received = await asyncRetry({interval, times}, async () => {
      await generate({});

      const {utxos} = await getUtxos({lnd: target.lnd});

      const confirmed = utxos.filter(n => !!n.confirmation_count);

      const ids = confirmed.map(n => n.transaction_id);

      if (!ids.includes(sweepId)) {
        throw new Error('ExpectedReceivedTaprootSwapSweep');
      }

      if (!ids.includes(sendId)) {
        throw new Error('ExpectedReceivedTaprootSwapSweepWithSend');
      }

      const lndUtxos = (await getUtxos({lnd})).utxos;

      const utxo = lndUtxos.find(n => n.transaction_id === sendId);

      if (!utxo || !utxo.confirmation_count) {
        throw new Error('ExpectedReceivedTaprootCoopSend');
      }

      return utxo;
    });

    equal(received.tokens, sendTokens, 'Send is received');
  } catch (err) {
    equal(err, null, 'Expected no error');
  } finally {
    await kill({});
  }

  return;
});

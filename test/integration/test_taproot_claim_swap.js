const {equal} = require('node:assert').strict;
const {randomBytes} = require('node:crypto');
const test = require('node:test');

const asyncRetry = require('async/retry');
const {broadcastChainTransaction} = require('ln-service');
const {componentsOfTransaction} = require('@alexbosworth/blockchain');
const {createChainAddress} = require('ln-service');
const {createPsbt} = require('psbt');
const {fundPsbt} = require('ln-service');
const {getHeight} = require('ln-service');
const {getUtxos} = require('ln-service');
const {hashForTree} = require('p2tr');
const {idForTransaction} = require('@alexbosworth/blockchain');
const {signPsbt} = require('ln-service');
const {spawnLightningCluster} = require('ln-docker-daemons');
const tinysecp = require('tiny-secp256k1');
const {v1OutputScript} = require('p2tr');

const {attemptTaprootClaim} = require('./../../');
const {swapScriptBranches} = require('./../../');

const defaultInternalKey = '0350929b74c1a04954b78b4b6035e97a5e078a5a0f28ec96d547bfee9ace803ac0';
const interval = 10;
const makeSecret = () => randomBytes(32).toString('hex');
const maturity = 100;
const maxFeeMultiplier = 10000;
const networkName = 'btcregtest';
const size = 2;
const times = 2000;
const timeout = 300;
const tokens = 1e6;

// Swapping in taproot with a claim should result in a successful claim
test(`Taproot claim swap`, async () => {
  const ecp = (await import('ecpair')).ECPairFactory(tinysecp);
  const {kill, nodes} = await spawnLightningCluster({size});

  const [{generate, lnd}, target] = nodes;

  const claimKey = ecp.makeRandom();
  const refundKey = ecp.makeRandom();
  const secret = makeSecret();

  try {
    await generate({count: maturity});

    const swapScript = swapScriptBranches({
      ecp,
      secret,
      timeout,
      claim_private_key: claimKey.privateKey.toString('hex'),
      refund_private_key: refundKey.privateKey.toString('hex'),
    });

    const output = v1OutputScript({
      hash: hashForTree({branches: swapScript.branches}).hash,
      internal_key: defaultInternalKey,
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

    // Confirm the tx into a block
    await asyncRetry({interval, times}, async () => {
      await generate({});

      const {utxos} = await getUtxos({lnd});

      const {id} = idForTransaction({transaction: signed.transaction});

      const utxo = utxos.find(n => n.transaction_id === id);

      if (!utxo || !utxo.confirmation_count) {
        throw new Error('ExpectedFunding');
      }
    });

    const {outputs} = componentsOfTransaction({
      transaction: signed.transaction,
    });

    const {transaction} = await attemptTaprootClaim({
      lnd,
      secret,
      tokens,
      claim_script: swapScript.claim,
      current_height: (await getHeight({lnd})).current_block_height,
      deadline_height: (await getHeight({lnd})).current_block_height + timeout,
      external_key: output.external_key,
      max_fee_multiplier: maxFeeMultiplier,
      network: networkName,
      output_script: output.script,
      private_key: claimKey.privateKey.toString('hex'),
      script_branches: swapScript.branches,
      start_height: (await getHeight({lnd})).current_block_height,
      sweep_address: (await createChainAddress({lnd})).address,
      transaction_id: idForTransaction({transaction: signed.transaction}).id,
      transaction_vout: outputs.findIndex(n => n.tokens === tokens),
    });

    // Confirm sweep success
    const {id} = idForTransaction({transaction});

    await asyncRetry({interval, times}, async () => {
      await generate({});

      const {utxos} = await getUtxos({lnd});

      const utxo = utxos.find(n => n.transaction_id === id);

      if (!utxo || !utxo.confirmation_count) {
        throw new Error('ExpectedReceivedTaprootSpend');
      }
    });

  } catch (err) {
    equal(err, null, 'Expected no error');
  }

  await kill({});

  return;
});

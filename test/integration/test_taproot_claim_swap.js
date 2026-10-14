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
const {outputScriptForAddress} = require('@alexbosworth/blockchain');
const {signPsbt} = require('ln-service');
const {spawnLightningCluster} = require('ln-docker-daemons');
const {v1OutputScript} = require('p2tr');

const {attemptTaprootClaim} = require('./../../');
const {makePrivateKey} = require('./../../script');
const {swapScriptBranches} = require('./../../');

const defaultInternalKey = '0350929b74c1a04954b78b4b6035e97a5e078a5a0f28ec96d547bfee9ace803ac0';
const interval = 10;
const makeSecret = () => randomBytes(32).toString('hex');
const maturity = 100;
const maxFeeMultiplier = 10000;
const network = 'btcregtest';
const sendTokens = 1e5;
const size = 2;
const timeout = 300;
const times = 2000;
const tokens = 1e6;

// Swapping in taproot with a claim should result in a successful claim
test(`Taproot claim swap`, async () => {
  const {kill, nodes} = await spawnLightningCluster({size});

  const [{generate, lnd}, target] = nodes;

  const claimKey = makePrivateKey({}).private_key;
  const refundKey = makePrivateKey({}).private_key;
  const secret = makeSecret();

  try {
    await generate({count: maturity});

    const swapScript = swapScriptBranches({
      secret,
      timeout,
      claim_private_key: claimKey,
      refund_private_key: refundKey,
    });

    const output = v1OutputScript({
      hash: hashForTree({branches: swapScript.branches}).hash,
      internal_key: defaultInternalKey,
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

    // Claim the first swap output
    const claim = await attemptTaprootClaim({
      lnd,
      network,
      secret,
      tokens,
      claim_script: swapScript.claim,
      current_height: (await getHeight({lnd})).current_block_height,
      deadline_height: (await getHeight({lnd})).current_block_height + timeout,
      external_key: output.external_key,
      max_fee_multiplier: maxFeeMultiplier,
      output_script: output.script,
      private_key: claimKey,
      script_branches: swapScript.branches,
      start_height: (await getHeight({lnd})).current_block_height,
      sweep_address: (await createChainAddress({lnd})).address,
      transaction_id: idForTransaction({transaction: signed.transaction}).id,
      transaction_vout: outputs.findIndex(n => n.tokens === tokens),
    });

    // Claim the second swap output with a send to the target
    const {address} = await createChainAddress({lnd: target.lnd});

    const sendClaim = await attemptTaprootClaim({
      lnd,
      network,
      secret,
      tokens,
      claim_script: swapScript.claim,
      current_height: (await getHeight({lnd})).current_block_height,
      deadline_height: (await getHeight({lnd})).current_block_height + timeout,
      external_key: output.external_key,
      max_fee_multiplier: maxFeeMultiplier,
      output_script: output.script,
      private_key: claimKey,
      script_branches: swapScript.branches,
      sends: [{address, tokens: sendTokens}],
      start_height: (await getHeight({lnd})).current_block_height,
      sweep_address: (await createChainAddress({lnd})).address,
      transaction_id: idForTransaction({transaction: signed.transaction}).id,
      transaction_vout: outputs.findLastIndex(n => n.tokens === tokens),
    });

    const sendClaimTx = componentsOfTransaction({
      transaction: sendClaim.transaction,
    });

    const sendScript = outputScriptForAddress({address, network}).script;

    const sendOutput = sendClaimTx.outputs.find(n => n.script === sendScript);

    equal(sendClaimTx.outputs.length, 2, 'Claim has sweep and send outputs');
    equal(sendOutput.tokens, sendTokens, 'Claim pays the send');

    // Confirm sweep success and the send
    const claimId = idForTransaction({transaction: claim.transaction}).id;
    const sendId = idForTransaction({transaction: sendClaim.transaction}).id;

    const received = await asyncRetry({interval, times}, async () => {
      await generate({});

      const {utxos} = await getUtxos({lnd});

      const confirmed = utxos.filter(n => !!n.confirmation_count);

      const ids = confirmed.map(n => n.transaction_id);

      if (!ids.includes(claimId)) {
        throw new Error('ExpectedReceivedTaprootSpend');
      }

      if (!ids.includes(sendId)) {
        throw new Error('ExpectedReceivedTaprootSpendWithSend');
      }

      const targetUtxos = (await getUtxos({lnd: target.lnd})).utxos;

      const utxo = targetUtxos.find(n => n.transaction_id === sendId);

      if (!utxo || !utxo.confirmation_count) {
        throw new Error('ExpectedReceivedTaprootClaimSend');
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

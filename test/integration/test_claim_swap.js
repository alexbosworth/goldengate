const {deepEqual} = require('node:assert').strict;
const {equal} = require('node:assert').strict;
const {randomBytes} = require('node:crypto');
const test = require('node:test');

const asyncRetry = require('async/retry');
const {componentsOfTransaction} = require('@alexbosworth/blockchain');
const {createChainAddress} = require('ln-service');
const {getChainTransactions} = require('ln-service');
const {getHeight} = require('ln-service');
const {getUtxos} = require('ln-service');
const {idForTransaction} = require('@alexbosworth/blockchain');
const {outputScriptForAddress} = require('@alexbosworth/blockchain');
const {sendToChainAddresses} = require('ln-service');
const {spawnLightningCluster} = require('ln-docker-daemons');

const {addressForScript} = require('./../../');
const {broadcastTransaction} = require('./../../');
const {claimTransaction} = require('./../../');
const {getPublicKey} = require('./../../script');
const {isSweep} = require('./../../');
const {makePrivateKey} = require('./../../script');
const {swapScript} = require('./../../');
const {swapScriptV2} = require('./../../');

const feeRate = 2;
const interval = 10;
const makeSecret = () => randomBytes(32).toString('hex');
const maturity = 100;
const network = 'btcregtest';
const scriptFor = address => outputScriptForAddress({address, network}).script;
const successSweep = {is_success_sweep: true, is_timeout_sweep: false};
const timeoutDelta = 100;
const times = 2000;
const tokens = 1e6;

// Claiming P2WSH swaps with the preimage should result in successful sweeps
test(`Claim swap`, async () => {
  const {kill, nodes} = await spawnLightningCluster({});

  const [{generate, lnd}] = nodes;

  try {
    await generate({count: maturity});

    const claimKey = makePrivateKey({}).private_key;
    const height = (await getHeight({lnd})).current_block_height;
    const refundKey = makePrivateKey({}).private_key;
    const secret = makeSecret();

    const refundPublicKey = getPublicKey({private_key: refundKey}).public_key;

    const v1 = swapScript({
      secret,
      claim_private_key: claimKey,
      refund_public_key: refundPublicKey,
      timeout: height + timeoutDelta,
    });

    const v2 = swapScriptV2({
      secret,
      claim_private_key: claimKey,
      refund_public_key: refundPublicKey,
      timeout: height + timeoutDelta,
    });

    const v1Address = addressForScript({network, script: v1.script}).address;
    const v2Address = addressForScript({network, script: v2.script}).address;

    // Send coins to the swap addresses
    const {id} = await sendToChainAddresses({
      lnd,
      send_to: [{tokens, address: v1Address}, {tokens, address: v2Address}],
    });

    // Wait for the swap funding to confirm
    const funding = await asyncRetry({interval, times}, async () => {
      await generate({});

      const {transactions} = await getChainTransactions({lnd});

      const tx = transactions.find(n => n.id === id);

      if (!tx || !tx.is_confirmed) {
        throw new Error('ExpectedSwapFundingConfirmed');
      }

      return tx;
    });

    const blockHeight = (await getHeight({lnd})).current_block_height;
    const sweepAddress = (await createChainAddress({lnd})).address;

    const {outputs} = componentsOfTransaction({
      transaction: funding.transaction,
    });

    const scripts = outputs.map(n => n.script);

    // Claim the v1 swap
    const v1Claim = claimTransaction({
      network,
      secret,
      tokens,
      block_height: blockHeight,
      fee_tokens_per_vbyte: feeRate,
      private_key: claimKey,
      sweep_address: sweepAddress,
      transaction_id: id,
      transaction_vout: scripts.indexOf(scriptFor(v1Address)),
      witness_script: v1.script,
    });

    const v1Id = idForTransaction({transaction: v1Claim.transaction}).id;
    const v1Type = isSweep({transaction: v1Claim.transaction});

    deepEqual(v1Type, successSweep, 'V1 claim is a success sweep');

    const v1Published = await broadcastTransaction({
      lnd,
      transaction: v1Claim.transaction,
    });

    equal(v1Published.transaction_id, v1Id, 'V1 claim is published');

    // Claim the v2 swap
    const v2Claim = claimTransaction({
      network,
      secret,
      tokens,
      block_height: blockHeight,
      fee_tokens_per_vbyte: feeRate,
      private_key: claimKey,
      sweep_address: sweepAddress,
      transaction_id: id,
      transaction_vout: scripts.indexOf(scriptFor(v2Address)),
      witness_script: v2.script,
    });

    const v2Id = idForTransaction({transaction: v2Claim.transaction}).id;
    const v2Type = isSweep({transaction: v2Claim.transaction});

    deepEqual(v2Type, successSweep, 'V2 claim is a success sweep');

    const v2Published = await broadcastTransaction({
      lnd,
      transaction: v2Claim.transaction,
    });

    equal(v2Published.transaction_id, v2Id, 'V2 claim is published');

    // Wait for the claims to confirm
    await asyncRetry({interval, times}, async () => {
      await generate({});

      const {utxos} = await getUtxos({lnd});

      const confirmed = utxos.filter(n => !!n.confirmation_count);

      const ids = confirmed.map(n => n.transaction_id);

      if (!ids.includes(v1Published.transaction_id)) {
        throw new Error('ExpectedV1ClaimConfirmed');
      }

      if (!ids.includes(v2Published.transaction_id)) {
        throw new Error('ExpectedV2ClaimConfirmed');
      }
    });
  } catch (err) {
    equal(err, null, 'Expected no error');
  } finally {
    await kill({});
  }

  return;
});

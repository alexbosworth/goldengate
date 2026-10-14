const {createHash} = require('node:crypto');
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
const {getPublicKey} = require('./../../script');
const {isSweep} = require('./../../');
const {makePrivateKey} = require('./../../script');
const {refundTransaction} = require('./../../');
const {swapScript} = require('./../../');
const {swapScriptV2} = require('./../../');

const feeRate = 2;
const interval = 10;
const maturity = 100;
const network = 'btcregtest';
const scriptFor = address => outputScriptForAddress({address, network}).script;
const sha256 = preimage => createHash('sha256').update(preimage).digest('hex');
const timeoutDelta = 10;
const timeoutSweep = {is_success_sweep: false, is_timeout_sweep: true};
const times = 2000;
const tokens = 1e6;

// Refunding P2WSH and nested P2WSH swaps should result in timeout sweeps
test(`Refund swap`, async () => {
  const {kill, nodes} = await spawnLightningCluster({});

  const [{generate, lnd}] = nodes;

  try {
    await generate({count: maturity});

    const claimKey = makePrivateKey({}).private_key;
    const hash = sha256(randomBytes(32));
    const height = (await getHeight({lnd})).current_block_height;
    const refundKey = makePrivateKey({}).private_key;

    const claimPublicKey = getPublicKey({private_key: claimKey}).public_key;
    const timeout = height + timeoutDelta;

    const v1 = swapScript({
      hash,
      timeout,
      claim_public_key: claimPublicKey,
      refund_private_key: refundKey,
    });

    const v2 = swapScriptV2({
      hash,
      timeout,
      claim_public_key: claimPublicKey,
      refund_private_key: refundKey,
    });

    const v1Addresses = addressForScript({network, script: v1.script});
    const v2Addresses = addressForScript({network, script: v2.script});

    // Send coins to the swap addresses
    const {id} = await sendToChainAddresses({
      lnd,
      send_to: [
        {tokens, address: v1Addresses.address},
        {tokens, address: v1Addresses.nested},
        {tokens, address: v2Addresses.address},
        {tokens, address: v2Addresses.nested},
      ],
    });

    // Confirm the funding and mine to the swap timeout
    const funding = await asyncRetry({interval, times}, async () => {
      await generate({});

      const {transactions} = await getChainTransactions({lnd});

      const tx = transactions.find(n => n.id === id);

      if (!tx || !tx.is_confirmed) {
        throw new Error('ExpectedSwapFundingConfirmed');
      }

      if ((await getHeight({lnd})).current_block_height < timeout) {
        throw new Error('ExpectedSwapTimeoutReached');
      }

      return tx;
    });

    const sweepAddress = (await createChainAddress({lnd})).address;

    const {outputs} = componentsOfTransaction({
      transaction: funding.transaction,
    });

    const scripts = outputs.map(n => n.script);

    // Refund the v1 swap
    const v1Refund = refundTransaction({
      network,
      tokens,
      block_height: timeout,
      fee_tokens_per_vbyte: feeRate,
      private_key: refundKey,
      sweep_address: sweepAddress,
      transaction_id: id,
      transaction_vout: scripts.indexOf(scriptFor(v1Addresses.address)),
      witness_script: v1.script,
    });

    const v1Tx = v1Refund.transaction;

    const v1Id = idForTransaction({transaction: v1Tx}).id;
    const v1Type = isSweep({transaction: v1Tx});

    deepEqual(v1Type, timeoutSweep, 'V1 is a timeout sweep');

    const v1Published = await broadcastTransaction({
      lnd,
      transaction: v1Tx,
    });

    equal(v1Published.transaction_id, v1Id, 'V1 published');

    // Refund the nested v1 swap
    const nestedV1Refund = refundTransaction({
      network,
      tokens,
      block_height: timeout,
      fee_tokens_per_vbyte: feeRate,
      is_nested: true,
      private_key: refundKey,
      sweep_address: sweepAddress,
      transaction_id: id,
      transaction_vout: scripts.indexOf(scriptFor(v1Addresses.nested)),
      witness_script: v1.script,
    });

    const nestedV1Tx = nestedV1Refund.transaction;

    const nestedV1Id = idForTransaction({transaction: nestedV1Tx}).id;
    const nestedV1Type = isSweep({transaction: nestedV1Tx});

    deepEqual(nestedV1Type, timeoutSweep, 'Nested v1 is a timeout sweep');

    const nestedV1Published = await broadcastTransaction({
      lnd,
      transaction: nestedV1Tx,
    });

    equal(nestedV1Published.transaction_id, nestedV1Id, 'Nested v1 published');

    // Refund the v2 swap
    const v2Refund = refundTransaction({
      network,
      tokens,
      block_height: timeout,
      fee_tokens_per_vbyte: feeRate,
      private_key: refundKey,
      sweep_address: sweepAddress,
      transaction_id: id,
      transaction_vout: scripts.indexOf(scriptFor(v2Addresses.address)),
      witness_script: v2.script,
    });

    const v2Tx = v2Refund.transaction;

    const v2Id = idForTransaction({transaction: v2Tx}).id;
    const v2Type = isSweep({transaction: v2Tx});

    deepEqual(v2Type, timeoutSweep, 'V2 is a timeout sweep');

    const v2Published = await broadcastTransaction({
      lnd,
      transaction: v2Tx,
    });

    equal(v2Published.transaction_id, v2Id, 'V2 published');

    // Refund the nested v2 swap
    const nestedV2Refund = refundTransaction({
      network,
      tokens,
      block_height: timeout,
      fee_tokens_per_vbyte: feeRate,
      is_nested: true,
      private_key: refundKey,
      sweep_address: sweepAddress,
      transaction_id: id,
      transaction_vout: scripts.indexOf(scriptFor(v2Addresses.nested)),
      witness_script: v2.script,
    });

    const nestedV2Tx = nestedV2Refund.transaction;

    const nestedV2Id = idForTransaction({transaction: nestedV2Tx}).id;
    const nestedV2Type = isSweep({transaction: nestedV2Tx});

    deepEqual(nestedV2Type, timeoutSweep, 'Nested v2 is a timeout sweep');

    const nestedV2Published = await broadcastTransaction({
      lnd,
      transaction: nestedV2Tx,
    });

    equal(nestedV2Published.transaction_id, nestedV2Id, 'Nested v2 published');

    // Wait for the refunds to confirm
    await asyncRetry({interval, times}, async () => {
      await generate({});

      const {utxos} = await getUtxos({lnd});

      const confirmed = utxos.filter(n => !!n.confirmation_count);

      const ids = confirmed.map(n => n.transaction_id);

      if (!ids.includes(v1Published.transaction_id)) {
        throw new Error('ExpectedV1RefundConfirmed');
      }

      if (!ids.includes(nestedV1Published.transaction_id)) {
        throw new Error('ExpectedNestedV1RefundConfirmed');
      }

      if (!ids.includes(v2Published.transaction_id)) {
        throw new Error('ExpectedV2RefundConfirmed');
      }

      if (!ids.includes(nestedV2Published.transaction_id)) {
        throw new Error('ExpectedNestedV2RefundConfirmed');
      }
    });
  } catch (err) {
    equal(err, null, 'Expected no error');
  } finally {
    await kill({});
  }

  return;
});

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
const {sizeOfTransaction} = require('@alexbosworth/blockchain');
const {spawnLightningCluster} = require('ln-docker-daemons');
const {subscribeToBlocks} = require('ln-service');

const {addressForScript} = require('./../../');
const {attemptRefund} = require('./../../');
const {getPublicKey} = require('./../../script');
const {isSweep} = require('./../../');
const {makePrivateKey} = require('./../../script');
const {swapScript} = require('./../../');
const {swapScriptV2} = require('./../../');

const defaultFeeRate = 1;
const feeRate = 2;
const {floor} = Math;
const interval = 10;
const maturity = 100;
const network = 'btcregtest';
const scriptFor = address => outputScriptForAddress({address, network}).script;
const sha256 = preimage => createHash('sha256').update(preimage).digest('hex');
const timeoutDelta = 10;
const timeoutSweep = {is_success_sweep: false, is_timeout_sweep: true};
const times = 2000;
const tokens = 1e6;
const version2 = 2;

// Attempting a refund should find a swap deposit and refund it
test(`Attempt refund`, async () => {
  const {kill, nodes} = await spawnLightningCluster({});

  const [{generate, lnd}] = nodes;

  try {
    // Wait for the chain notifier to start
    await asyncRetry({interval, times}, cbk => {
      const sub = subscribeToBlocks({lnd});

      sub.once('block', () => {
        sub.removeAllListeners();

        return cbk();
      });

      sub.once('error', err => {
        sub.removeAllListeners();

        return cbk(err);
      });
    });

    await generate({count: maturity});

    const hash = sha256(randomBytes(32));
    const refundKey = makePrivateKey({}).private_key;
    const servicePrivateKey = makePrivateKey({}).private_key;
    const startHeight = (await getHeight({lnd})).current_block_height;

    const serviceKey = getPublicKey({private_key: servicePrivateKey});
    const timeout = startHeight + timeoutDelta;

    const v1 = swapScript({
      hash,
      timeout,
      claim_public_key: serviceKey.public_key,
      refund_private_key: refundKey,
    });

    const v2 = swapScriptV2({
      hash,
      timeout,
      claim_public_key: serviceKey.public_key,
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

    // Confirm the deposit and mine to the swap timeout
    const deposit = await asyncRetry({interval, times}, async () => {
      await generate({});

      const {transactions} = await getChainTransactions({lnd});

      const tx = transactions.find(n => n.id === id);

      if (!tx || !tx.is_confirmed) {
        throw new Error('ExpectedSwapDepositConfirmed');
      }

      if ((await getHeight({lnd})).current_block_height < timeout) {
        throw new Error('ExpectedSwapTimeoutReached');
      }

      return tx;
    });

    const sweepAddress = (await createChainAddress({lnd})).address;

    const {outputs} = componentsOfTransaction({
      transaction: deposit.transaction,
    });

    const scripts = outputs.map(n => n.script);

    // Refund the native v1 swap
    const v1Refund = await attemptRefund({
      hash,
      lnd,
      network,
      tokens,
      fee_tokens_per_vbyte: feeRate,
      refund_private_key: refundKey,
      service_public_key: serviceKey.public_key,
      start_height: startHeight,
      sweep_address: sweepAddress,
      timeout_height: timeout,
    });

    const v1Tx = v1Refund.refund_transaction;

    const v1Id = idForTransaction({transaction: v1Tx}).id;
    const v1Size = sizeOfTransaction({transaction: v1Tx}).vsize;
    const v1Spend = componentsOfTransaction({transaction: v1Tx});
    const v1Type = isSweep({transaction: v1Tx});
    const v1Vout = scripts.indexOf(scriptFor(v1Addresses.address));

    const [v1Input] = v1Spend.inputs;
    const [v1Output] = v1Spend.outputs;

    const v1Fee = tokens - v1Output.tokens;
    const v1MinFee = floor(feeRate * v1Size);

    equal(v1Refund.transaction_id, id, 'Got v1 deposit id');
    equal(v1Refund.transaction_vout, v1Vout, 'Got v1 vout');
    equal(v1Input.id, id, 'V1 refund spends deposit');
    equal(v1Input.vout, v1Vout, 'V1 refund spends vout');
    deepEqual(v1Type, timeoutSweep, 'V1 is a timeout sweep');
    equal(v1Fee >= v1MinFee, true, 'V1 pays fee rate');

    // Refund the nested v1 swap
    const nestedV1Refund = await attemptRefund({
      hash,
      lnd,
      network,
      tokens,
      fee_tokens_per_vbyte: feeRate,
      is_nested: true,
      refund_private_key: refundKey,
      service_public_key: serviceKey.public_key,
      start_height: startHeight,
      sweep_address: sweepAddress,
      timeout_height: timeout,
    });

    const nestedV1Tx = nestedV1Refund.refund_transaction;

    const nestedV1Id = idForTransaction({transaction: nestedV1Tx}).id;
    const nestedV1Size = sizeOfTransaction({transaction: nestedV1Tx}).vsize;
    const nestedV1Spend = componentsOfTransaction({transaction: nestedV1Tx});
    const nestedV1Type = isSweep({transaction: nestedV1Tx});
    const nestedV1Vout = scripts.indexOf(scriptFor(v1Addresses.nested));

    const [nestedV1Input] = nestedV1Spend.inputs;
    const [nestedV1Output] = nestedV1Spend.outputs;

    const nestedV1Fee = tokens - nestedV1Output.tokens;
    const nestedV1MinFee = floor(feeRate * nestedV1Size);

    equal(nestedV1Refund.transaction_id, id, 'Got nested v1 deposit id');
    equal(nestedV1Refund.transaction_vout, nestedV1Vout, 'Got nested v1 vout');
    equal(nestedV1Input.id, id, 'Nested v1 refund spends deposit');
    equal(nestedV1Input.vout, nestedV1Vout, 'Nested v1 refund spends vout');
    deepEqual(nestedV1Type, timeoutSweep, 'Nested v1 is a timeout sweep');
    equal(nestedV1Fee >= nestedV1MinFee, true, 'Nested v1 pays fee rate');

    // Refund the native v2 swap at the default fee rate
    const v2Refund = await attemptRefund({
      hash,
      lnd,
      network,
      tokens,
      refund_private_key: refundKey,
      service_public_key: serviceKey.public_key,
      start_height: startHeight,
      sweep_address: sweepAddress,
      timeout_height: timeout,
      version: version2,
    });

    const v2Tx = v2Refund.refund_transaction;

    const v2Id = idForTransaction({transaction: v2Tx}).id;
    const v2Size = sizeOfTransaction({transaction: v2Tx}).vsize;
    const v2Spend = componentsOfTransaction({transaction: v2Tx});
    const v2Type = isSweep({transaction: v2Tx});
    const v2Vout = scripts.indexOf(scriptFor(v2Addresses.address));

    const [v2Input] = v2Spend.inputs;
    const [v2Output] = v2Spend.outputs;

    const v2Fee = tokens - v2Output.tokens;
    const v2MinFee = floor(defaultFeeRate * v2Size);

    equal(v2Refund.transaction_id, id, 'Got v2 deposit id');
    equal(v2Refund.transaction_vout, v2Vout, 'Got v2 vout');
    equal(v2Input.id, id, 'V2 refund spends deposit');
    equal(v2Input.vout, v2Vout, 'V2 refund spends vout');
    deepEqual(v2Type, timeoutSweep, 'V2 is a timeout sweep');
    equal(v2Fee >= v2MinFee, true, 'V2 pays fee rate');

    // Refund the nested v2 swap at the default fee rate
    const nestedV2Refund = await attemptRefund({
      hash,
      lnd,
      network,
      tokens,
      is_nested: true,
      refund_private_key: refundKey,
      service_public_key: serviceKey.public_key,
      start_height: startHeight,
      sweep_address: sweepAddress,
      timeout_height: timeout,
      version: version2,
    });

    const nestedV2Tx = nestedV2Refund.refund_transaction;

    const nestedV2Id = idForTransaction({transaction: nestedV2Tx}).id;
    const nestedV2Size = sizeOfTransaction({transaction: nestedV2Tx}).vsize;
    const nestedV2Spend = componentsOfTransaction({transaction: nestedV2Tx});
    const nestedV2Type = isSweep({transaction: nestedV2Tx});
    const nestedV2Vout = scripts.indexOf(scriptFor(v2Addresses.nested));

    const [nestedV2Input] = nestedV2Spend.inputs;
    const [nestedV2Output] = nestedV2Spend.outputs;

    const nestedV2Fee = tokens - nestedV2Output.tokens;
    const nestedV2MinFee = floor(defaultFeeRate * nestedV2Size);

    equal(nestedV2Refund.transaction_id, id, 'Got nested v2 deposit id');
    equal(nestedV2Refund.transaction_vout, nestedV2Vout, 'Got nested v2 vout');
    equal(nestedV2Input.id, id, 'Nested v2 refund spends deposit');
    equal(nestedV2Input.vout, nestedV2Vout, 'Nested v2 refund spends vout');
    deepEqual(nestedV2Type, timeoutSweep, 'Nested v2 is a timeout sweep');
    equal(nestedV2Fee >= nestedV2MinFee, true, 'Nested v2 pays fee rate');

    // Wait for the refunds to confirm
    await asyncRetry({interval, times}, async () => {
      await generate({});

      const {utxos} = await getUtxos({lnd});

      const confirmed = utxos.filter(n => !!n.confirmation_count);

      const ids = confirmed.map(n => n.transaction_id);

      if (!ids.includes(v1Id)) {
        throw new Error('ExpectedV1RefundConfirmed');
      }

      if (!ids.includes(nestedV1Id)) {
        throw new Error('ExpectedNestedV1RefundConfirmed');
      }

      if (!ids.includes(v2Id)) {
        throw new Error('ExpectedV2RefundConfirmed');
      }

      if (!ids.includes(nestedV2Id)) {
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

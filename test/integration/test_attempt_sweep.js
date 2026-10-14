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

const {addressForScript} = require('./../../');
const {attemptSweep} = require('./../../');
const {getPublicKey} = require('./../../script');
const {isSweep} = require('./../../');
const {makePrivateKey} = require('./../../script');
const {swapScript} = require('./../../');
const {swapScriptV2} = require('./../../');

const addressFor = script => addressForScript({network, script}).address;
const deadlineDelta = 100;
const firstSendTokens = 1e5;
const {floor} = Math;
const fractionalFeeRate = 1.5;
const interval = 10;
const makeSecret = () => randomBytes(32).toString('hex');
const maturity = 100;
const maxFeeMultiplier = 1000;
const network = 'btcregtest';
const outputFor = (tx, script) => tx.outputs.find(n => n.script === script);
const scriptFor = address => outputScriptForAddress({address, network}).script;
const secondSendTokens = 2e5;
const successSweep = {is_success_sweep: true, is_timeout_sweep: false};
const sumOf = arr => arr.reduce((sum, n) => sum + n, Number());
const timeoutDelta = 200;
const times = 2000;
const tokens = 1e6;

// Attempting a sweep should claim a swap with the preimage through lnd
test(`Attempt sweep`, async () => {
  const {kill, nodes} = await spawnLightningCluster({});

  const [{generate, lnd}] = nodes;

  try {
    await generate({count: maturity});

    const claimKey = makePrivateKey({}).private_key;
    const height = (await getHeight({lnd})).current_block_height;
    const refundKey = makePrivateKey({}).private_key;
    const secret = makeSecret();
    const sendsSecret = makeSecret();

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

    // Make swaps with another secret to sweep with sends
    const v1Sends = swapScript({
      claim_private_key: claimKey,
      refund_public_key: refundPublicKey,
      secret: sendsSecret,
      timeout: height + timeoutDelta,
    });

    const v2Sends = swapScriptV2({
      claim_private_key: claimKey,
      refund_public_key: refundPublicKey,
      secret: sendsSecret,
      timeout: height + timeoutDelta,
    });

    const v1Address = addressFor(v1.script);
    const v1SendsAddress = addressFor(v1Sends.script);
    const v2Address = addressFor(v2.script);
    const v2SendsAddress = addressFor(v2Sends.script);

    // Send coins to the swap addresses
    const {id} = await sendToChainAddresses({
      lnd,
      send_to: [
        {tokens, address: v1Address},
        {tokens, address: v2Address},
        {tokens, address: v1SendsAddress},
        {tokens, address: v2SendsAddress},
      ],
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

    const currentHeight = (await getHeight({lnd})).current_block_height;
    const sweepAddress = (await createChainAddress({lnd})).address;

    const {outputs} = componentsOfTransaction({
      transaction: funding.transaction,
    });

    const scripts = outputs.map(n => n.script);

    // Sweep the v1 swap at the chain fee rate
    const v1Sweep = await attemptSweep({
      lnd,
      network,
      secret,
      tokens,
      current_height: currentHeight,
      deadline_height: currentHeight + deadlineDelta,
      max_fee_multiplier: maxFeeMultiplier,
      private_key: claimKey,
      start_height: currentHeight,
      sweep_address: sweepAddress,
      transaction_id: id,
      transaction_vout: scripts.indexOf(scriptFor(v1Address)),
      witness_script: v1.script,
    });

    const v1Tx = v1Sweep.transaction;

    const v1Claim = componentsOfTransaction({transaction: v1Tx});
    const v1Id = idForTransaction({transaction: v1Tx}).id;
    const v1Size = sizeOfTransaction({transaction: v1Tx}).vsize;
    const v1Type = isSweep({transaction: v1Tx});

    const v1Fee = tokens - sumOf(v1Claim.outputs.map(n => n.tokens));
    const v1MinFee = floor(v1Sweep.fee_rate * v1Size);

    deepEqual(v1Type, successSweep, 'V1 sweep is a success sweep');
    equal(v1Fee >= v1MinFee, true, 'V1 sweep pays the fee rate');

    // Sweep the v2 swap at the chain fee rate
    const v2Sweep = await attemptSweep({
      lnd,
      network,
      secret,
      tokens,
      current_height: currentHeight,
      deadline_height: currentHeight + deadlineDelta,
      max_fee_multiplier: maxFeeMultiplier,
      private_key: claimKey,
      start_height: currentHeight,
      sweep_address: sweepAddress,
      transaction_id: id,
      transaction_vout: scripts.indexOf(scriptFor(v2Address)),
      witness_script: v2.script,
    });

    const v2Tx = v2Sweep.transaction;

    const v2Claim = componentsOfTransaction({transaction: v2Tx});
    const v2Id = idForTransaction({transaction: v2Tx}).id;
    const v2Size = sizeOfTransaction({transaction: v2Tx}).vsize;
    const v2Type = isSweep({transaction: v2Tx});

    const v2Fee = tokens - sumOf(v2Claim.outputs.map(n => n.tokens));
    const v2MinFee = floor(v2Sweep.fee_rate * v2Size);

    deepEqual(v2Type, successSweep, 'V2 sweep is a success sweep');
    equal(v2Fee >= v2MinFee, true, 'V2 sweep pays the fee rate');

    const firstSendAddress = (await createChainAddress({lnd})).address;
    const secondSendAddress = (await createChainAddress({lnd})).address;

    const firstSendScript = scriptFor(firstSendAddress);
    const secondSendScript = scriptFor(secondSendAddress);

    const sends = [
      {address: firstSendAddress, tokens: firstSendTokens},
      {address: secondSendAddress, tokens: secondSendTokens},
    ];

    // Sweep the v1 swap with sends at a fractional fee rate
    const v1SendsSweep = await attemptSweep({
      lnd,
      network,
      sends,
      tokens,
      current_height: currentHeight,
      deadline_height: currentHeight + deadlineDelta,
      max_fee_multiplier: maxFeeMultiplier,
      min_fee_rate: fractionalFeeRate,
      private_key: claimKey,
      secret: sendsSecret,
      start_height: currentHeight,
      sweep_address: sweepAddress,
      transaction_id: id,
      transaction_vout: scripts.indexOf(scriptFor(v1SendsAddress)),
      witness_script: v1Sends.script,
    });

    const v1SendsTx = v1SendsSweep.transaction;

    const v1SendsClaim = componentsOfTransaction({transaction: v1SendsTx});
    const v1SendsId = idForTransaction({transaction: v1SendsTx}).id;
    const v1SendsSize = sizeOfTransaction({transaction: v1SendsTx}).vsize;
    const v1SendsType = isSweep({transaction: v1SendsTx});

    const v1FirstSend = outputFor(v1SendsClaim, firstSendScript);
    const v1SecondSend = outputFor(v1SendsClaim, secondSendScript);
    const v1SendsFee = tokens - sumOf(v1SendsClaim.outputs.map(n => n.tokens));
    const v1SendsMinFee = floor(v1SendsSweep.fee_rate * v1SendsSize);

    deepEqual(v1SendsType, successSweep, 'V1 sends sweep is a success sweep');
    equal(v1SendsFee >= v1SendsMinFee, true, 'V1 sends sweep pays fee rate');
    equal(v1FirstSend.tokens, firstSendTokens, 'V1 sweep pays first send');
    equal(v1SecondSend.tokens, secondSendTokens, 'V1 sweep pays second send');

    // Sweep the v2 swap with sends at a fractional fee rate
    const v2SendsSweep = await attemptSweep({
      lnd,
      network,
      sends,
      tokens,
      current_height: currentHeight,
      deadline_height: currentHeight + deadlineDelta,
      max_fee_multiplier: maxFeeMultiplier,
      min_fee_rate: fractionalFeeRate,
      private_key: claimKey,
      secret: sendsSecret,
      start_height: currentHeight,
      sweep_address: sweepAddress,
      transaction_id: id,
      transaction_vout: scripts.indexOf(scriptFor(v2SendsAddress)),
      witness_script: v2Sends.script,
    });

    const v2SendsTx = v2SendsSweep.transaction;

    const v2SendsClaim = componentsOfTransaction({transaction: v2SendsTx});
    const v2SendsId = idForTransaction({transaction: v2SendsTx}).id;
    const v2SendsSize = sizeOfTransaction({transaction: v2SendsTx}).vsize;
    const v2SendsType = isSweep({transaction: v2SendsTx});

    const v2FirstSend = outputFor(v2SendsClaim, firstSendScript);
    const v2SecondSend = outputFor(v2SendsClaim, secondSendScript);
    const v2SendsFee = tokens - sumOf(v2SendsClaim.outputs.map(n => n.tokens));
    const v2SendsMinFee = floor(v2SendsSweep.fee_rate * v2SendsSize);

    deepEqual(v2SendsType, successSweep, 'V2 sends sweep is a success sweep');
    equal(v2SendsFee >= v2SendsMinFee, true, 'V2 sends sweep pays fee rate');
    equal(v2FirstSend.tokens, firstSendTokens, 'V2 sweep pays first send');
    equal(v2SecondSend.tokens, secondSendTokens, 'V2 sweep pays second send');

    // Wait for the sweeps to confirm
    const received = await asyncRetry({interval, times}, async () => {
      await generate({});

      const {utxos} = await getUtxos({lnd});

      const confirmed = utxos.filter(n => !!n.confirmation_count);

      const ids = confirmed.map(n => n.transaction_id);

      if (!ids.includes(v1Id)) {
        throw new Error('ExpectedV1SweepConfirmed');
      }

      if (!ids.includes(v2Id)) {
        throw new Error('ExpectedV2SweepConfirmed');
      }

      if (!ids.includes(v1SendsId)) {
        throw new Error('ExpectedV1SweepWithSendsConfirmed');
      }

      if (!ids.includes(v2SendsId)) {
        throw new Error('ExpectedV2SweepWithSendsConfirmed');
      }

      return confirmed;
    });

    const v1Utxos = received.filter(n => n.transaction_id === v1Id);
    const v2Utxos = received.filter(n => n.transaction_id === v2Id);
    const v1SendsUtxos = received.filter(n => n.transaction_id === v1SendsId);
    const v2SendsUtxos = received.filter(n => n.transaction_id === v2SendsId);

    const v1Received = sumOf(v1Utxos.map(n => n.tokens));
    const v2Received = sumOf(v2Utxos.map(n => n.tokens));
    const v1SendsReceived = sumOf(v1SendsUtxos.map(n => n.tokens));
    const v2SendsReceived = sumOf(v2SendsUtxos.map(n => n.tokens));

    equal(v1Received, tokens - v1Fee, 'V1 sweep is received');
    equal(v2Received, tokens - v2Fee, 'V2 sweep is received');
    equal(v1SendsReceived, tokens - v1SendsFee, 'V1 sends sweep is received');
    equal(v2SendsReceived, tokens - v2SendsFee, 'V2 sends sweep is received');
  } catch (err) {
    equal(err, null, 'Expected no error');
  } finally {
    await kill({});
  }

  return;
});

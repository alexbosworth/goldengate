const {equal} = require('node:assert').strict;
const {randomBytes} = require('node:crypto');
const test = require('node:test');

const asyncRetry = require('async/retry');
const {beginGroupSigningSession} = require('ln-service');
const {componentsOfTransaction} = require('@alexbosworth/blockchain');
const {createChainAddress} = require('ln-service');
const {endGroupSigningSession} = require('ln-service');
const {getChainTransactions} = require('ln-service');
const {getHeight} = require('ln-service');
const {getPublicKey} = require('ln-service');
const {getUtxos} = require('ln-service');
const {hashForTree} = require('p2tr');
const {idForTransaction} = require('@alexbosworth/blockchain');
const {sendToChainOutputScripts} = require('ln-service');
const {spawnLightningCluster} = require('ln-docker-daemons');
const {v1OutputScript} = require('p2tr');

const {attemptTaprootClaim} = require('./../../');
const {broadcastTransaction} = require('./../../');
const {makePrivateKey} = require('./../../script');
const {swapScriptBranches} = require('./../../');
const {taprootRefundTransaction} = require('./../../');
const xOnlyPublicKey = require('./../../taproot/x_only_public_key');

const claimTimeoutDelta = 100;
const evenPrefix = '02';
const family = 805;
const feeRate = 2;
const interval = 10;
const makeSecret = () => randomBytes(32).toString('hex');
const maturity = 100;
const maxFeeMultiplier = 1000;
const network = 'btcregtest';
const refundTimeoutDelta = 10;
const times = 2000;
const tokens = 1e6;

// Spending a Taproot swap with a MuSig2 internal key should use the right key
test(`Taproot internal key swap`, async () => {
  const {kill, nodes} = await spawnLightningCluster({});

  const [{generate, lnd}] = nodes;

  try {
    await generate({count: maturity});

    const claimKey = makePrivateKey({}).private_key;
    const height = (await getHeight({lnd})).current_block_height;
    const refundKey = makePrivateKey({}).private_key;
    const secret = makeSecret();

    const refundTimeout = height + refundTimeoutDelta;

    // Make a swap to claim, with a far timeout
    const claimable = swapScriptBranches({
      secret,
      claim_private_key: claimKey,
      refund_private_key: refundKey,
      timeout: height + claimTimeoutDelta,
    });

    // Make a swap to refund, with a near timeout
    const refundable = swapScriptBranches({
      secret,
      claim_private_key: claimKey,
      refund_private_key: refundKey,
      timeout: refundTimeout,
    });

    const rootHash = hashForTree({branches: claimable.branches}).hash;

    // Make a MuSig2 key to use as the internal key
    const localKey = await getPublicKey({family, lnd});
    const remoteKey = await getPublicKey({family, lnd});

    const session = await beginGroupSigningSession({
      lnd,
      key_family: family,
      key_index: localKey.index,
      public_keys: [remoteKey.public_key],
      root_hash: rootHash,
    });

    await endGroupSigningSession({lnd, id: session.id});

    const claimableOutput = v1OutputScript({
      hash: rootHash,
      internal_key: session.internal_key,
    });

    const groupKey = xOnlyPublicKey({public_key: session.external_key});

    const outputKey = xOnlyPublicKey({
      public_key: claimableOutput.external_key,
    });

    equal(outputKey.x_only, groupKey.x_only, 'Output key is the MuSig2 key');

    const refundableOutput = v1OutputScript({
      hash: hashForTree({branches: refundable.branches}).hash,
      internal_key: session.internal_key,
    });

    // Send coins to the swap outputs
    const funding = await sendToChainOutputScripts({
      lnd,
      fee_tokens_per_vbyte: feeRate,
      send_to: [
        {tokens, script: claimableOutput.script},
        {tokens, script: refundableOutput.script},
      ],
    });

    // Wait for the swap funding to confirm
    await asyncRetry({interval, times}, async () => {
      await generate({});

      const {transactions} = await getChainTransactions({lnd});

      const tx = transactions.find(n => n.id === funding.id);

      if (!tx || !tx.is_confirmed) {
        throw new Error('ExpectedSwapFundingConfirmed');
      }
    });

    const claimHeight = (await getHeight({lnd})).current_block_height;
    const internalKey = xOnlyPublicKey({public_key: session.internal_key});

    const {outputs} = componentsOfTransaction({
      transaction: funding.transaction,
    });

    const scripts = outputs.map(n => n.script);

    // Claim with the internal key in compressed form
    const claim = await attemptTaprootClaim({
      lnd,
      network,
      secret,
      tokens,
      claim_script: claimable.claim,
      current_height: claimHeight,
      deadline_height: claimHeight + claimTimeoutDelta,
      external_key: claimableOutput.external_key,
      internal_key: `${evenPrefix}${internalKey.x_only}`,
      max_fee_multiplier: maxFeeMultiplier,
      min_fee_rate: feeRate,
      output_script: claimableOutput.script,
      private_key: claimKey,
      script_branches: claimable.branches,
      start_height: claimHeight,
      sweep_address: (await createChainAddress({lnd})).address,
      transaction_id: funding.id,
      transaction_vout: scripts.indexOf(claimableOutput.script),
    });

    // Mine to the refund timeout
    await asyncRetry({interval, times}, async () => {
      await generate({});

      if ((await getHeight({lnd})).current_block_height < refundTimeout) {
        throw new Error('ExpectedSwapTimeoutReached');
      }
    });

    // Refund with the internal key in x-only form
    const refund = taprootRefundTransaction({
      network,
      tokens,
      block_height: refundTimeout,
      external_key: refundableOutput.external_key,
      fee_tokens_per_vbyte: feeRate,
      internal_key: internalKey.x_only,
      output_script: refundableOutput.script,
      private_key: refundKey,
      refund_script: refundable.refund,
      script_branches: refundable.branches,
      sweep_address: (await createChainAddress({lnd})).address,
      transaction_id: funding.id,
      transaction_vout: scripts.indexOf(refundableOutput.script),
    });

    await broadcastTransaction({lnd, transaction: refund.transaction});

    const claimId = idForTransaction({transaction: claim.transaction}).id;
    const refundId = idForTransaction({transaction: refund.transaction}).id;

    // Wait for the claim and the refund to confirm
    await asyncRetry({interval, times}, async () => {
      await generate({});

      const {utxos} = await getUtxos({lnd});

      const confirmed = utxos.filter(n => !!n.confirmation_count);

      const ids = confirmed.map(n => n.transaction_id);

      if (!ids.includes(claimId)) {
        throw new Error('ExpectedClaimConfirmed');
      }

      if (!ids.includes(refundId)) {
        throw new Error('ExpectedRefundConfirmed');
      }
    });
  } catch (err) {
    equal(err, null, 'Expected no error');
  } finally {
    await kill({});
  }

  return;
});

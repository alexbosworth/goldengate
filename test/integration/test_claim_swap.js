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
const {makePrivateKey} = require('./../../script');
const {swapScriptV2} = require('./../../');

const feeRate = 2;
const interval = 10;
const makeSecret = () => randomBytes(32).toString('hex');
const maturity = 100;
const network = 'btcregtest';
const scriptFor = address => outputScriptForAddress({address, network}).script;
const timeoutDelta = 100;
const times = 2000;
const tokens = 1e6;

// Claiming a P2WSH swap with the preimage should sweep the swap
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

    const swap = swapScriptV2({
      secret,
      claim_private_key: claimKey,
      refund_public_key: refundPublicKey,
      timeout: height + timeoutDelta,
    });

    const {address} = addressForScript({network, script: swap.script});

    // Send coins to the swap address
    const {id} = await sendToChainAddresses({
      lnd,
      send_to: [{address, tokens}],
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

    // Claim the swap
    const claim = claimTransaction({
      network,
      secret,
      tokens,
      block_height: blockHeight,
      fee_tokens_per_vbyte: feeRate,
      private_key: claimKey,
      sweep_address: sweepAddress,
      transaction_id: id,
      transaction_vout: scripts.indexOf(scriptFor(address)),
      witness_script: swap.script,
    });

    const claimId = idForTransaction({transaction: claim.transaction}).id;

    const published = await broadcastTransaction({
      lnd,
      transaction: claim.transaction,
    });

    equal(published.transaction_id, claimId, 'Claim is published');

    // Wait for the claim to confirm
    await asyncRetry({interval, times}, async () => {
      await generate({});

      const {utxos} = await getUtxos({lnd});

      const confirmed = utxos.filter(n => !!n.confirmation_count);

      const ids = confirmed.map(n => n.transaction_id);

      if (!ids.includes(published.transaction_id)) {
        throw new Error('ExpectedClaimConfirmed');
      }
    });
  } catch (err) {
    equal(err, null, 'Expected no error');
  } finally {
    await kill({});
  }

  return;
});

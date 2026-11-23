const {createHash} = require('node:crypto');
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
const {makePrivateKey} = require('./../../script');
const {refundTransaction} = require('./../../');
const {swapScriptV2} = require('./../../');

const feeRate = 2;
const interval = 10;
const maturity = 100;
const network = 'btcregtest';
const scriptFor = address => outputScriptForAddress({address, network}).script;
const sha256 = preimage => createHash('sha256').update(preimage).digest('hex');
const timeoutDelta = 10;
const times = 2000;
const tokens = 1e6;

// Refunding a P2WSH swap after its timeout should sweep the swap
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

    const swap = swapScriptV2({
      hash,
      timeout,
      claim_public_key: claimPublicKey,
      refund_private_key: refundKey,
    });

    const {address} = addressForScript({network, script: swap.script});

    // Send coins to the swap address
    const {id} = await sendToChainAddresses({
      lnd,
      send_to: [{address, tokens}],
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

    // Refund the swap
    const refund = refundTransaction({
      network,
      tokens,
      block_height: timeout,
      fee_tokens_per_vbyte: feeRate,
      private_key: refundKey,
      sweep_address: sweepAddress,
      transaction_id: id,
      transaction_vout: scripts.indexOf(scriptFor(address)),
      witness_script: swap.script,
    });

    const refundTx = refund.transaction;

    const refundId = idForTransaction({transaction: refundTx}).id;

    const published = await broadcastTransaction({
      lnd,
      transaction: refundTx,
    });

    equal(published.transaction_id, refundId, 'Refund is published');

    // Wait for the refund to confirm
    await asyncRetry({interval, times}, async () => {
      await generate({});

      const {utxos} = await getUtxos({lnd});

      const confirmed = utxos.filter(n => !!n.confirmation_count);

      const ids = confirmed.map(n => n.transaction_id);

      if (!ids.includes(published.transaction_id)) {
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

const {equal} = require('node:assert').strict;
const {randomBytes} = require('node:crypto');
const test = require('node:test');

const {addPeer} = require('ln-service');
const asyncRetry = require('async/retry');
const {componentsOfTransaction} = require('@alexbosworth/blockchain');
const {createChainAddress} = require('ln-service');
const {fundPendingChannels} = require('ln-service');
const {fundPsbt} = require('ln-service');
const {getChainTransactions} = require('ln-service');
const {getChannels} = require('ln-service');
const {getHeight} = require('ln-service');
const {idForTransaction} = require('@alexbosworth/blockchain');
const {openChannels} = require('ln-service');
const {outputScriptForAddress} = require('@alexbosworth/blockchain');
const {sendToChainAddress} = require('ln-service');
const {signPsbt} = require('ln-service');
const {spawnLightningCluster} = require('ln-docker-daemons');

const {addressForScript} = require('./../../');
const {claimTransaction} = require('./../../');
const {getPsbtFromTransaction} = require('./../../');
const {getPublicKey} = require('./../../script');
const {makePrivateKey} = require('./../../script');
const {swapScriptV2} = require('./../../');

const feeRate = 2;
const format = 'p2wpkh';
const interval = 10;
const makeSecret = () => randomBytes(32).toString('hex');
const maturity = 100;
const network = 'btcregtest';
const size = 2;
const timeoutDelta = 100;
const times = 2000;
const tokens = 1e6;

// Getting a PSBT from a transaction should fill out a PSBT from a transaction
test(`Get PSBT from transaction`, async () => {
  const {kill, nodes} = await spawnLightningCluster({size});

  const [{generate, id, lnd}, target] = nodes;

  try {
    await generate({count: maturity});

    const {address} = await createChainAddress({format, lnd: target.lnd});

    await sendToChainAddress({address, lnd, tokens});

    await generate({count: maturity});

    await addPeer({lnd, public_key: target.id, socket: target.socket});

    const {pending} = await asyncRetry({interval, times}, async () => {
      return await openChannels({
        channels: [{capacity: tokens / size, partner_public_key: id}],
        lnd: target.lnd,
      });
    });

    const funded = await asyncRetry({interval, times}, async () => {
      return await fundPsbt({lnd: target.lnd, outputs: pending});
    });

    const signed = await signPsbt({lnd: target.lnd, psbt: funded.psbt});

    const {transactions} = await getChainTransactions({lnd: target.lnd})

    const [transaction] = transactions.map(n => n.transaction);

    const final = await getPsbtFromTransaction({
      network,
      request: (args, cbk) => cbk(null, null, transaction),
      transaction: signed.transaction,
    });

    await fundPendingChannels({
      channels: pending.map(n => n.id),
      funding: final.psbt,
      lnd: target.lnd,
    });

    // Wait for the pending channel to activate
    await asyncRetry({interval, times}, async () => {
      await generate({});

      if (!(await getChannels({lnd})).channels.length) {
        throw new Error('ExpectedChannelFundedAndCreated');
      }
    });

    // Fund a channel with a P2WSH swap claim
    const claimKey = makePrivateKey({}).private_key;
    const refundKey = makePrivateKey({}).private_key;
    const secret = makeSecret();

    const {script} = swapScriptV2({
      secret,
      claim_private_key: claimKey,
      refund_public_key: getPublicKey({private_key: refundKey}).public_key,
      timeout: (await getHeight({lnd})).current_block_height + timeoutDelta,
    });

    const swap = addressForScript({network, script});

    const deposit = await sendToChainAddress({
      lnd,
      tokens,
      address: swap.address,
    });

    // Wait for the swap deposit to confirm
    const depositTx = await asyncRetry({interval, times}, async () => {
      await generate({});

      const {transactions} = await getChainTransactions({lnd});

      const tx = transactions.find(n => n.id === deposit.id);

      if (!tx || !tx.is_confirmed) {
        throw new Error('ExpectedSwapDepositConfirmed');
      }

      return tx.transaction;
    });

    const depositHeight = (await getHeight({lnd})).current_block_height;

    // Wait for the target to see the swap deposit
    await asyncRetry({interval, times}, async () => {
      const targetTip = await getHeight({lnd: target.lnd});

      if (targetTip.current_block_height < depositHeight) {
        throw new Error('ExpectedTargetToSeeSwapDeposit');
      }
    });

    const swapOutput = outputScriptForAddress({
      network,
      address: swap.address,
    });

    const {outputs} = componentsOfTransaction({transaction: depositTx});

    const proposal = await asyncRetry({interval, times}, async () => {
      return await openChannels({
        channels: [{capacity: tokens / size, partner_public_key: id}],
        lnd: target.lnd,
      });
    });

    const [channel] = proposal.pending;

    // Claim the swap into the channel funding output
    const claim = claimTransaction({
      network,
      secret,
      tokens,
      block_height: (await getHeight({lnd})).current_block_height,
      fee_tokens_per_vbyte: feeRate,
      private_key: claimKey,
      sends: [{address: channel.address, tokens: channel.tokens}],
      sweep_address: (await createChainAddress({lnd})).address,
      transaction_id: deposit.id,
      transaction_vout: outputs.findIndex(n => n.script === swapOutput.script),
      witness_script: script,
    });

    const swapFunding = await getPsbtFromTransaction({
      network,
      request: (args, cbk) => cbk(null, null, depositTx),
      transaction: claim.transaction,
    });

    await fundPendingChannels({
      channels: [channel.id],
      funding: swapFunding.psbt,
      lnd: target.lnd,
    });

    const claimId = idForTransaction({transaction: claim.transaction}).id;

    // Wait for the channel funded by the swap claim to activate
    await asyncRetry({interval, times}, async () => {
      await generate({});

      const {channels} = await getChannels({lnd});

      if (!channels.find(n => n.transaction_id === claimId)) {
        throw new Error('ExpectedChannelFundedBySwapClaim');
      }
    });
  } catch (err) {
    equal(err, null, 'Expected no error');
  } finally {
    await kill({});
  }

  return;
});

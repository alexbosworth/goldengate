const {addPeer} = require('ln-service');
const asyncRetry = require('async/retry');
const {broadcastChainTransaction} = require('ln-service');
const {createChainAddress} = require('ln-service');
const {fundPendingChannels} = require('ln-service');
const {fundPsbt} = require('ln-service');
const {getChainTransactions} = require('ln-service');
const {getChannels} = require('ln-service');
const {getNetwork} = require('ln-sync');
const {openChannels} = require('ln-service');
const {sendToChainAddress} = require('ln-service');
const {signPsbt} = require('ln-service');
const {spawnLightningCluster} = require('ln-docker-daemons');
const {test} = require('@alexbosworth/tap');
const tinysecp = require('tiny-secp256k1');

const {getPsbtFromTransaction} = require('./../../');

const format = 'p2wpkh';
const interval = 10;
const maturity = 100;
const size = 2;
const times = 2000;
const tokens = 1e6;

// Getting a PSBT from a transaction should fill out a PSBT from a transaction
test(`Get PSBT from transaction`, async ({end, equal}) => {
  const ecp = (await import('ecpair')).ECPairFactory(tinysecp);
  const {kill, nodes} = await spawnLightningCluster({size});

  const [{generate, id, lnd}, target] = nodes;

  try {
    await generate({count: maturity});

    const {network} = await getNetwork({lnd});

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
  } catch (err) {
    equal(err, null, 'Expected no error');
  }

  await kill({});

  return end();
});

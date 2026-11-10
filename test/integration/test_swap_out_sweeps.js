const {createHash} = require('node:crypto');
const {equal} = require('node:assert').strict;
const {randomBytes} = require('node:crypto');
const {rejects} = require('node:assert').strict;
const test = require('node:test');

const asyncRetry = require('async/retry');
const {componentsOfTransaction} = require('@alexbosworth/blockchain');
const {createChainAddress} = require('ln-service');
const {getChainTransactions} = require('ln-service');
const {getHeight} = require('ln-service');
const {getPublicKey} = require('ln-service');
const {getUtxos} = require('ln-service');
const {idForTransaction} = require('@alexbosworth/blockchain');
const {parsePaymentRequest} = require('ln-service');
const {pay} = require('ln-service');
const {setupChannel} = require('ln-docker-daemons');
const {spawnLightningCluster} = require('ln-docker-daemons');

const {attemptTaprootClaim} = require('./../../');
const {broadcastTransaction} = require('./../../');
const {createSwapOut} = require('./../../');
const {getCoopSignedTx} = require('./../../');
const {lightningLabsSwapAuth} = require('./../../');
const {lightningLabsSwapService} = require('./../../');
const {makePrivateKey} = require('./../../script');
const {releaseSwapOutSecret} = require('./../../');
const swapKey = require('./../../script/get_public_key');
const {swapOutServer} = require('./../macros');
const {taprootSwapOutHtlc} = require('./../macros');
const {waitForSameChainTip} = require('./../macros');

const bufferAsHex = buffer => buffer.toString('hex');
const bumpBlocks = 50;
const channelCapacity = 2e6;
const cltvDelta = 100;
const family = 805;
const feeRate = 2;
const fundWindowMs = 1000 * 60 * 30;
const interval = 10;
const macaroon = Buffer.from('macaroon').toString('base64');
const maturity = 100;
const maxFeeMultiplier = 10;
const network = 'btcregtest';
const preimage = Buffer.alloc(32).toString('hex');
const prepayTokens = 3000;
const sha256 = secret => createHash('sha256').update(secret).digest('hex');
const size = 2;
const swapFee = 1000;
const taprootVersion = 'MUSIG2';
const times = 2000;
const tokens = 250000;

// The output of a transaction that an HTLC is in
const outputOf = ({transaction, transaction_vout}) => {
  return componentsOfTransaction({transaction}).outputs[transaction_vout];
};

// Pay a request, the result comes once the payment settles or fails back
const payRequest = ({lnd, request}) => {
  return pay({lnd, request}).then(paid => ({paid}), err => ({err}));
};

// Taproot swap outs are swept with the service or claimed with the preimage
test(`Taproot swap out sweeps`, async () => {
  const {kill, nodes} = await spawnLightningCluster({size});

  const [client, server] = nodes;

  const lnds = [client.lnd, server.lnd];

  const swapServer = await swapOutServer({
    network,
    cltv_delta: cltvDelta,
    fee: swapFee,
    key_family: family,
    lnd: server.lnd,
    prepay: prepayTokens,
  });

  const {metadata} = lightningLabsSwapAuth({macaroon, preimage});

  const {service} = lightningLabsSwapService({
    network,
    cert: swapServer.cert,
    socket: swapServer.socket,
  });

  try {
    await server.generate({count: maturity});

    // The client mines its blocks on top of the service blocks
    await waitForSameChainTip({lnds});

    // The client pays for swaps with a channel to the service
    await setupChannel({
      capacity: channelCapacity,
      generate: client.generate,
      lnd: client.lnd,
      to: server,
    });

    // The service mines its blocks on top of the client blocks
    await waitForSameChainTip({lnds});

    const claimKey = makePrivateKey({}).private_key;
    const coopKey = await getPublicKey({family, lnd: client.lnd});
    const fundAt = new Date(Date.now() + fundWindowMs).toISOString();
    const height = await getHeight({lnd: client.lnd});
    const secrets = {claim: randomBytes(32), coop: randomBytes(32)};

    const claimPublicKey = swapKey({private_key: claimKey}).public_key;
    const timeout = height.current_block_height + cltvDelta;

    // Make a swap that the client pays, the service holds the payments
    const makeSwap = async ({key, secret}) => {
      const hash = sha256(secret);

      const swap = await createSwapOut({
        hash,
        metadata,
        network,
        service,
        timeout,
        tokens,
        fund_at: fundAt,
        public_key: key,
      });

      const htlc = taprootSwapOutHtlc({
        hash,
        timeout,
        claim_public_key: key,
        service_public_key: swap.service_public_key,
      });

      const {payment} = parsePaymentRequest({request: swap.swap_fund_request});

      const prepaying = payRequest({
        lnd: client.lnd,
        request: swap.swap_execute_request,
      });

      const paying = payRequest({
        lnd: client.lnd,
        request: swap.swap_fund_request,
      });

      return {hash, htlc, paying, payment, prepaying, swap};
    };

    // The client sweeps one swap with the service, it uses an LND key
    const coop = await makeSwap({
      key: coopKey.public_key,
      secret: secrets.coop,
    });

    // The client claims the other swap alone, it uses a key it has itself
    const claimed = await makeSwap({
      key: claimPublicKey,
      secret: secrets.claim,
    });

    // The service publishes each HTLC once its payments are held
    const coopHtlc = await asyncRetry({interval, times}, async () => {
      return await swapServer.publish({id: coop.hash});
    });

    const claimHtlc = await asyncRetry({interval, times}, async () => {
      return await swapServer.publish({id: claimed.hash});
    });

    const claimOutput = outputOf(claimHtlc);
    const coopOutput = outputOf(coopHtlc);

    // The client and the service agree on the HTLCs
    equal(coopOutput.script, coop.htlc.output_script, 'Got the coop HTLC');
    equal(coopOutput.tokens, tokens, 'Coop HTLC pays the swap tokens');
    equal(claimOutput.script, claimed.htlc.output_script, 'Got claim HTLC');
    equal(claimOutput.tokens, tokens, 'Claim HTLC pays the swap tokens');

    // The service mines the HTLCs into a block
    await asyncRetry({interval, times}, async () => {
      await server.generate({});

      const {transactions} = await getChainTransactions({lnd: server.lnd});

      const confirmed = transactions.filter(n => !!n.is_confirmed);

      const ids = confirmed.map(n => n.id);

      if (!ids.includes(coopHtlc.transaction_id)) {
        throw new Error('ExpectedCoopSwapHtlcConfirmed');
      }

      if (!ids.includes(claimHtlc.transaction_id)) {
        throw new Error('ExpectedClaimSwapHtlcConfirmed');
      }
    });

    // The client mines its blocks on top of the service blocks
    await waitForSameChainTip({lnds});

    const {address} = await createChainAddress({lnd: client.lnd});

    const coopSweep = {
      metadata,
      network,
      service,
      tokens,
      fee_tokens_per_vbyte: feeRate,
      funding_hash: coop.hash,
      funding_payment: coop.payment,
      key_family: family,
      key_index: coopKey.index,
      lnd: client.lnd,
      output_script: coop.htlc.output_script,
      public_keys: [coop.swap.service_public_key],
      root_hash: coop.htlc.root_hash,
      script_branches: coop.htlc.branches,
      sweep_address: address,
      transaction_id: coopHtlc.transaction_id,
      transaction_vout: coopHtlc.transaction_vout,
    };

    // The service does not co-sign a sweep before it has the preimage
    await rejects(
      getCoopSignedTx(coopSweep),
      err => err[2].err.details === 'ExpectedPaidSwapToCoSignSweep',
      'The service keeps its refund path until the swap is paid'
    );

    // The client gives the service the preimage before it sweeps the HTLC
    await releaseSwapOutSecret({
      metadata,
      service,
      secret: bufferAsHex(secrets.coop),
    });

    const [push] = swapServer.requests.loopOutPushPreimage;

    equal(push.protocol_version, taprootVersion, 'Pushed a Taproot preimage');

    // The service settles the swap payment with the preimage right away
    const coopPayment = await coop.paying;

    equal(coopPayment.paid.secret, bufferAsHex(secrets.coop), 'Swap is paid');

    // With the preimage the service co-signs a sweep of the HTLC
    const {transaction} = await getCoopSignedTx(coopSweep);

    const [sweepInput] = componentsOfTransaction({transaction}).inputs;

    equal(sweepInput.witness.length, 1, 'A coop sweep is a key spend');

    await broadcastTransaction({transaction, lnd: client.lnd});

    const tip = await getHeight({lnd: client.lnd});

    const claim = {
      network,
      tokens,
      claim_script: claimed.htlc.claim,
      current_height: tip.current_block_height,
      deadline_height: timeout,
      external_key: claimed.htlc.external_key,
      internal_key: claimed.htlc.internal_key,
      lnd: client.lnd,
      max_fee_multiplier: maxFeeMultiplier,
      min_fee_rate: feeRate,
      output_script: claimed.htlc.output_script,
      private_key: claimKey,
      script_branches: claimed.htlc.branches,
      secret: bufferAsHex(secrets.claim),
      sweep_address: address,
      transaction_id: claimHtlc.transaction_id,
      transaction_vout: claimHtlc.transaction_vout,
    };

    // The client claims the other HTLC at the minimum fee rate
    const first = await attemptTaprootClaim({
      ...claim,
      start_height: tip.current_block_height,
    });

    // A claim further along its fee schedule replaces the first claim
    const bumped = await attemptTaprootClaim({
      ...claim,
      start_height: tip.current_block_height - bumpBlocks,
    });

    equal(bumped.fee_rate > first.fee_rate, true, 'Replacement pays more');

    const claimId = idForTransaction({transaction: bumped.transaction}).id;
    const coopId = idForTransaction({transaction}).id;

    // The client mines the cooperative sweep and the replacement claim
    await asyncRetry({interval, times}, async () => {
      await client.generate({});

      const {utxos} = await getUtxos({lnd: client.lnd});

      const confirmed = utxos.filter(n => !!n.confirmation_count);

      const ids = confirmed.map(n => n.transaction_id);

      if (!ids.includes(coopId)) {
        throw new Error('ExpectedCoopSweepConfirmed');
      }

      if (!ids.includes(claimId)) {
        throw new Error('ExpectedReplacementClaimConfirmed');
      }
    });

    // The service gets the preimage from the claim and settles the payment
    await swapServer.settleFromClaim({
      id: claimed.hash,
      transaction: bumped.transaction,
    });

    const claimPayment = await claimed.paying;

    equal(claimPayment.paid.secret, bufferAsHex(secrets.claim), 'Swap paid');

    // The prepays were taken when the HTLCs were published
    const prepays = await Promise.all([coop.prepaying, claimed.prepaying]);

    equal(prepays[0].paid.tokens, prepayTokens, 'Coop swap prepay is paid');
    equal(prepays[1].paid.tokens, prepayTokens, 'Claim swap prepay is paid');
  } catch (err) {
    equal(err, null, 'Expected no error');
  } finally {
    service.close();

    swapServer.stop();

    await kill({});
  }

  return;
});

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
const {outputScriptForAddress} = require('@alexbosworth/blockchain');
const {sendToChainAddresses} = require('ln-service');
const {spawnLightningCluster} = require('ln-docker-daemons');

const {addressForScript} = require('./../../');
const {broadcastTransaction} = require('./../../');
const {claimTransaction} = require('./../../');
const {createSwapOut} = require('./../../');
const {getPublicKey} = require('./../../script');
const {makePrivateKey} = require('./../../script');
const {swapScriptV2} = require('./../../');

const bufferAsHex = buffer => buffer.toString('hex');
const cltvDelta = 100;
const feeRate = 2;
const hashOf = secret => sha256(hexAsBuffer(secret));
const hexAsBuffer = hex => Buffer.from(hex, 'hex');
const interval = 10;
const makeSecret = () => randomBytes(32).toString('hex');
const maturity = 100;
const network = 'btcregtest';
const scriptFor = address => outputScriptForAddress({address, network}).script;
const sha256 = preimage => createHash('sha256').update(preimage).digest('hex');
const size = 2;
const times = 2000;
const tokens = 1e6;

// Creating a swap out should give a swap that the client can claim
test(`Create swap out`, async () => {
  const {kill, nodes} = await spawnLightningCluster({size});

  const [client, server] = nodes;

  try {
    await server.generate({count: maturity});

    const serverKey = makePrivateKey({}).private_key;

    const serverPublicKey = getPublicKey({private_key: serverKey}).public_key;
    const swapHtlcs = {};

    // The server makes the swap HTLC from the swap request
    const service = {
      newLoopOutSwap: (req, {}, cbk) => {
        const {script} = swapScriptV2({
          claim_public_key: bufferAsHex(req.receiver_key),
          hash: bufferAsHex(req.swap_hash),
          refund_public_key: serverPublicKey,
          timeout: req.expiry,
        });

        const {address} = addressForScript({network, script});

        swapHtlcs[bufferAsHex(req.swap_hash)] = address;

        return cbk(null, {
          prepay_invoice: 'prepay_invoice',
          sender_key: hexAsBuffer(serverPublicKey),
          swap_invoice: 'swap_invoice',
        });
      },
    };

    const bothSecret = makeSecret();
    const clientKey = makePrivateKey({}).private_key;
    const hashSecret = makeSecret();
    const height = (await getHeight({lnd: client.lnd})).current_block_height;

    const clientPublicKey = getPublicKey({private_key: clientKey}).public_key;
    const timeout = height + cltvDelta;

    // Create a swap with a new claim key and secret
    const swap = await createSwapOut({
      network,
      service,
      timeout,
      tokens,
      metadata: {},
    });

    // Create a swap with the client public key
    const keySwap = await createSwapOut({
      network,
      service,
      timeout,
      tokens,
      metadata: {},
      public_key: clientPublicKey,
    });

    equal(!!keySwap.private_key, false, 'Swap has no private key');

    // Create a swap with the hash of a client secret
    const hashSwap = await createSwapOut({
      network,
      service,
      timeout,
      tokens,
      hash: hashOf(hashSecret),
      metadata: {},
    });

    equal(!!hashSwap.secret, false, 'Swap has no secret');

    // Create a swap with the client public key and a hash
    const bothSwap = await createSwapOut({
      network,
      service,
      timeout,
      tokens,
      hash: hashOf(bothSecret),
      metadata: {},
      public_key: clientPublicKey,
    });

    equal(!!bothSwap.private_key, false, 'Swap has no private key');
    equal(!!bothSwap.secret, false, 'Swap has no secret');

    const bothHtlc = swapHtlcs[hashOf(bothSecret)];
    const hashHtlc = swapHtlcs[hashOf(hashSecret)];
    const htlc = swapHtlcs[hashOf(swap.secret)];
    const keyHtlc = swapHtlcs[hashOf(keySwap.secret)];

    // Swaps should pay to the server HTLCs
    equal(swap.address, htlc, 'Swap pays to HTLC');
    equal(keySwap.address, keyHtlc, 'Key swap pays to HTLC');
    equal(hashSwap.address, hashHtlc, 'Hash swap pays to HTLC');
    equal(bothSwap.address, bothHtlc, 'Key and hash swap pays to HTLC');

    // Fund the swap HTLCs
    const {id} = await sendToChainAddresses({
      lnd: server.lnd,
      send_to: [
        {tokens, address: htlc},
        {tokens, address: keyHtlc},
        {tokens, address: hashHtlc},
        {tokens, address: bothHtlc},
      ],
    });

    // Wait for the swap funding to confirm
    const funding = await asyncRetry({interval, times}, async () => {
      await server.generate({});

      const {transactions} = await getChainTransactions({lnd: server.lnd});

      const tx = transactions.find(n => n.id === id);

      if (!tx || !tx.is_confirmed) {
        throw new Error('ExpectedSwapFundingConfirmed');
      }

      return tx;
    });

    // Wait for the client to see the swap funding
    const chainTip = await asyncRetry({interval, times}, async () => {
      const tip = await getHeight({lnd: client.lnd});

      if (tip.current_block_height < funding.confirmation_height) {
        throw new Error('ExpectedClientToSeeSwapFunding');
      }

      return tip;
    });

    const sweepAddress = (await createChainAddress({lnd: client.lnd})).address;

    const {outputs} = componentsOfTransaction({
      transaction: funding.transaction,
    });

    const scripts = outputs.map(n => n.script);

    // Claim the swap with its claim key and secret
    const claim = claimTransaction({
      network,
      tokens,
      block_height: chainTip.current_block_height,
      fee_tokens_per_vbyte: feeRate,
      private_key: swap.private_key,
      secret: swap.secret,
      sweep_address: sweepAddress,
      transaction_id: id,
      transaction_vout: scripts.indexOf(scriptFor(swap.address)),
      witness_script: swap.script,
    });

    const claimed = await broadcastTransaction({
      lnd: client.lnd,
      transaction: claim.transaction,
    });

    // Claim the key swap with the client key
    const keyClaim = claimTransaction({
      network,
      tokens,
      block_height: chainTip.current_block_height,
      fee_tokens_per_vbyte: feeRate,
      private_key: clientKey,
      secret: keySwap.secret,
      sweep_address: sweepAddress,
      transaction_id: id,
      transaction_vout: scripts.indexOf(scriptFor(keySwap.address)),
      witness_script: keySwap.script,
    });

    const keyClaimed = await broadcastTransaction({
      lnd: client.lnd,
      transaction: keyClaim.transaction,
    });

    // Claim the hash swap with the client secret
    const hashClaim = claimTransaction({
      network,
      tokens,
      block_height: chainTip.current_block_height,
      fee_tokens_per_vbyte: feeRate,
      private_key: hashSwap.private_key,
      secret: hashSecret,
      sweep_address: sweepAddress,
      transaction_id: id,
      transaction_vout: scripts.indexOf(scriptFor(hashSwap.address)),
      witness_script: hashSwap.script,
    });

    const hashClaimed = await broadcastTransaction({
      lnd: client.lnd,
      transaction: hashClaim.transaction,
    });

    // Claim the key and hash swap with the client key and secret
    const bothClaim = claimTransaction({
      network,
      tokens,
      block_height: chainTip.current_block_height,
      fee_tokens_per_vbyte: feeRate,
      private_key: clientKey,
      secret: bothSecret,
      sweep_address: sweepAddress,
      transaction_id: id,
      transaction_vout: scripts.indexOf(scriptFor(bothSwap.address)),
      witness_script: bothSwap.script,
    });

    const bothClaimed = await broadcastTransaction({
      lnd: client.lnd,
      transaction: bothClaim.transaction,
    });

    // Wait for the claims to confirm
    await asyncRetry({interval, times}, async () => {
      await client.generate({});

      const {utxos} = await getUtxos({lnd: client.lnd});

      const confirmed = utxos.filter(n => !!n.confirmation_count);

      const ids = confirmed.map(n => n.transaction_id);

      if (!ids.includes(claimed.transaction_id)) {
        throw new Error('ExpectedSwapClaimConfirmed');
      }

      if (!ids.includes(keyClaimed.transaction_id)) {
        throw new Error('ExpectedPublicKeySwapClaimConfirmed');
      }

      if (!ids.includes(hashClaimed.transaction_id)) {
        throw new Error('ExpectedHashSwapClaimConfirmed');
      }

      if (!ids.includes(bothClaimed.transaction_id)) {
        throw new Error('ExpectedPublicKeyAndHashSwapClaimConfirmed');
      }
    });
  } catch (err) {
    equal(err, null, 'Expected no error');
  } finally {
    await kill({});
  }

  return;
});

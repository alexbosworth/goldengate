const {createHash} = require('node:crypto');
const {equal} = require('node:assert').strict;
const {randomBytes} = require('node:crypto');
const test = require('node:test');

const asyncAuto = require('async/auto');
const asyncRetry = require('async/retry');
const {beginGroupSigningSession} = require('ln-service');
const {componentsOfTransaction} = require('@alexbosworth/blockchain');
const {createChainAddress} = require('ln-service');
const {decodePsbt} = require('psbt');
const {endGroupSigningSession} = require('ln-service');
const {getChainTransactions} = require('ln-service');
const {getHeight} = require('ln-service');
const {getPublicKey} = require('ln-service');
const {getUtxos} = require('ln-service');
const {hashForTree} = require('p2tr');
const {idForTransaction} = require('@alexbosworth/blockchain');
const {outputScriptForAddress} = require('@alexbosworth/blockchain');
const {returnResult} = require('asyncjs-util');
const {sendToChainOutputScripts} = require('ln-service');
const {spawnLightningCluster} = require('ln-docker-daemons');
const {updateGroupSigningSession} = require('ln-service');
const {v1HashToSign} = require('p2tr');
const {v1OutputScript} = require('p2tr');

const {broadcastTransaction} = require('./../../');
const {getCoopSignedTx} = require('./../../');
const {swapScriptBranches} = require('./../../');
const xOnlyPublicKey = require('./../../taproot/x_only_public_key');

const bufferAsHex = buffer => buffer.toString('hex');
const cltvDelta = 144;
const defaultSighash = 0;
const family = 805;
const feeRate = 2;
const hexAsBuffer = hex => Buffer.from(hex, 'hex');
const interval = 10;
const maturity = 100;
const network = 'btcregtest';
const sendTokens = 1e5;
const sha256 = preimage => createHash('sha256').update(preimage).digest('hex');
const size = 2;
const times = 2000;
const tokens = 1e6;

// Getting a cooperatively signed sweep should sweep a MuSig2 Taproot swap
test(`Get coop signed transaction`, async () => {
  const {kill, nodes} = await spawnLightningCluster({size});

  const [client, server] = nodes;

  try {
    await client.generate({count: maturity});

    const clientKey = await getPublicKey({family, lnd: client.lnd});
    const height = (await getHeight({lnd: client.lnd})).current_block_height;
    const serverKey = await getPublicKey({family, lnd: server.lnd});

    // Make a swap the client can claim and the server can refund
    const {branches} = swapScriptBranches({
      claim_public_key: clientKey.public_key,
      hash: sha256(randomBytes(32)),
      refund_public_key: serverKey.public_key,
      timeout: height + cltvDelta,
    });

    const rootHash = hashForTree({branches}).hash;

    // Get the MuSig2 key of the client and the server
    const session = await beginGroupSigningSession({
      key_family: family,
      key_index: clientKey.index,
      lnd: client.lnd,
      public_keys: [serverKey.public_key],
      root_hash: rootHash,
    });

    await endGroupSigningSession({id: session.id, lnd: client.lnd});

    const output = v1OutputScript({
      hash: rootHash,
      internal_key: session.internal_key,
    });

    const groupKey = xOnlyPublicKey({public_key: session.external_key});
    const outputKey = xOnlyPublicKey({public_key: output.external_key});

    equal(outputKey.x_only, groupKey.x_only, 'Output key is the MuSig2 key');

    // Make a swap server that co-signs sweeps
    const service = {
      muSig2SignSweep: (req, _, cbk) => {
        return asyncAuto({
          // Co-sign the sweep with the server key
          sign: async () => {
            const psbt = decodePsbt({psbt: bufferAsHex(req.sweep_tx_psbt)});

            const [{witness_utxo}] = psbt.inputs;

            const spend = {
              script: witness_utxo.script_pub,
              tokens: witness_utxo.tokens,
            };

            // Get the hash to sign from the sweep PSBT
            const {hash} = v1HashToSign({
              sighash: defaultSighash,
              spends: [spend],
              transaction: psbt.unsigned_transaction,
              vin: Number(),
            });

            const serverSession = await beginGroupSigningSession({
              key_family: family,
              key_index: serverKey.index,
              lnd: server.lnd,
              public_keys: [clientKey.public_key],
              root_hash: rootHash,
            });

            const {signature} = await updateGroupSigningSession({
              hash,
              id: serverSession.id,
              lnd: server.lnd,
              nonces: [bufferAsHex(req.nonce)],
            });

            return {
              nonce: hexAsBuffer(serverSession.nonce),
              partial_signature: hexAsBuffer(signature),
            };
          },
        },
        returnResult({of: 'sign'}, cbk));
      },
    };

    // Send coins to two swap outputs
    const funding = await sendToChainOutputScripts({
      fee_tokens_per_vbyte: feeRate,
      lnd: client.lnd,
      send_to: [
        {tokens, script: output.script},
        {tokens, script: output.script},
      ],
    });

    // Wait for the swap funding to confirm
    await asyncRetry({interval, times}, async () => {
      await client.generate({});

      const {transactions} = await getChainTransactions({lnd: client.lnd});

      const tx = transactions.find(n => n.id === funding.id);

      if (!tx || !tx.is_confirmed) {
        throw new Error('ExpectedSwapFundingConfirmed');
      }
    });

    const {outputs} = componentsOfTransaction({
      transaction: funding.transaction,
    });

    // Sweep the first swap output cooperatively
    const sweep = await getCoopSignedTx({
      network,
      service,
      tokens,
      fee_tokens_per_vbyte: feeRate,
      funding_hash: sha256(randomBytes(32)),
      funding_payment: bufferAsHex(randomBytes(32)),
      key_family: family,
      key_index: clientKey.index,
      lnd: client.lnd,
      output_script: output.script,
      public_keys: [serverKey.public_key],
      root_hash: rootHash,
      script_branches: branches,
      sweep_address: (await createChainAddress({lnd: client.lnd})).address,
      transaction_id: funding.id,
      transaction_vout: outputs.findIndex(n => n.script === output.script),
    });

    await broadcastTransaction({
      lnd: client.lnd,
      transaction: sweep.transaction,
    });

    // Sweep the second swap output with a send to the server
    const {address} = await createChainAddress({lnd: server.lnd});

    const sendSweep = await getCoopSignedTx({
      network,
      service,
      tokens,
      fee_tokens_per_vbyte: feeRate,
      funding_hash: sha256(randomBytes(32)),
      funding_payment: bufferAsHex(randomBytes(32)),
      key_family: family,
      key_index: clientKey.index,
      lnd: client.lnd,
      output_script: output.script,
      public_keys: [serverKey.public_key],
      root_hash: rootHash,
      script_branches: branches,
      sends: [{address, tokens: sendTokens}],
      sweep_address: (await createChainAddress({lnd: client.lnd})).address,
      transaction_id: funding.id,
      transaction_vout: outputs.findLastIndex(n => n.script === output.script),
    });

    await broadcastTransaction({
      lnd: client.lnd,
      transaction: sendSweep.transaction,
    });

    const sendSweepTx = componentsOfTransaction({
      transaction: sendSweep.transaction,
    });

    const sendScript = outputScriptForAddress({address, network}).script;

    const sendOutput = sendSweepTx.outputs.find(n => n.script === sendScript);

    equal(sendOutput.tokens, sendTokens, 'Sweep pays the send');

    const sendId = idForTransaction({transaction: sendSweep.transaction}).id;
    const sweepId = idForTransaction({transaction: sweep.transaction}).id;

    // Wait for the sweeps and the send to confirm
    const received = await asyncRetry({interval, times}, async () => {
      await client.generate({});

      const {utxos} = await getUtxos({lnd: client.lnd});

      const confirmed = utxos.filter(n => !!n.confirmation_count);

      const ids = confirmed.map(n => n.transaction_id);

      if (!ids.includes(sweepId)) {
        throw new Error('ExpectedCoopSignedSweepConfirmed');
      }

      if (!ids.includes(sendId)) {
        throw new Error('ExpectedCoopSignedSweepWithSendConfirmed');
      }

      const serverUtxos = (await getUtxos({lnd: server.lnd})).utxos;

      const utxo = serverUtxos.find(n => n.transaction_id === sendId);

      if (!utxo || !utxo.confirmation_count) {
        throw new Error('ExpectedCoopSignedSweepSendReceived');
      }

      return utxo;
    });

    equal(received.tokens, sendTokens, 'Send is received');
  } catch (err) {
    equal(err, null, 'Expected no error');
  } finally {
    await kill({});
  }

  return;
});

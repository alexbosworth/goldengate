const {createHash} = require('node:crypto');
const {equal} = require('node:assert').strict;
const {randomBytes} = require('node:crypto');
const test = require('node:test');

const asyncEachSeries = require('async/eachSeries');
const asyncRetry = require('async/retry');
const asyncTimesSeries = require('async/timesSeries');
const {beginGroupSigningSession} = require('ln-service');
const {componentsOfTransaction} = require('@alexbosworth/blockchain');
const {createChainAddress} = require('ln-service');
const {endGroupSigningSession} = require('ln-service');
const {getChainTransactions} = require('ln-service');
const {getHeight} = require('ln-service');
const {getPublicKey} = require('ln-service');
const {getUtxos} = require('ln-service');
const {idForTransaction} = require('@alexbosworth/blockchain');
const {sendToChainOutputScripts} = require('ln-service');
const {spawnLightningCluster} = require('ln-docker-daemons');
const {updateGroupSigningSession} = require('ln-service');
const {verifySchnorr} = require('tiny-secp256k1');

const {broadcastTransaction} = require('./../../');
const {encodeTransaction} = require('./../../transactions');
const {makePrivateKey} = require('./../../script');
const {refundTransaction} = require('./../../');
const {sharedAddressScript} = require('./../../');
const {signSwapInServiceFallback} = require('./../../');
const {swapInFallbacks} = require('./../../lightninglabs/conf/swap_service');
const {swapInServiceFallbackTx} = require('./../../');
const swapKey = require('./../../script/get_public_key');
const {swapScriptV2} = require('./../../');

const bufferAsHex = buffer => buffer.toString('hex');
const expiry = 14400;
const family = 42060;
const feeRate = 2;
const hexAsBuffer = hex => Buffer.from(hex, 'hex');
const interval = 10;
const maturity = 100;
const network = 'btcregtest';
const rates = {extreme: 10000, high: 5000, standard: 2500};
const sha256 = preimage => createHash('sha256').update(preimage).digest('hex');
const size = 2;
const timeoutDelta = 50;
const times = 2000;
const tokens = 251000;

// Signed shared address HTLC transactions should spend utxos to the HTLC
test(`Sign swap in HTLCs`, async () => {
  const {kill, nodes} = await spawnLightningCluster({size});

  const [client, server] = nodes;

  try {
    await client.generate({count: maturity});

    const clientKey = await getPublicKey({family, lnd: client.lnd});
    const serverKey = await getPublicKey({family, lnd: server.lnd});

    const address = sharedAddressScript({
      expiry,
      network,
      client_public_key: clientKey.public_key,
      server_public_key: serverKey.public_key,
    });

    // Make two utxos to the shared address
    const funding = await sendToChainOutputScripts({
      fee_tokens_per_vbyte: feeRate,
      lnd: client.lnd,
      send_to: [
        {script: address.output_script, tokens: 200000},
        {script: address.output_script, tokens: 100000},
      ],
    });

    // Wait for the utxos to confirm
    await asyncRetry({interval, times}, async () => {
      await client.generate({});

      const {transactions} = await getChainTransactions({lnd: client.lnd});

      const tx = transactions.find(n => n.id === funding.id);

      if (!tx || !tx.is_confirmed) {
        throw new Error('ExpectedSharedUtxosConfirmed');
      }
    });

    const {outputs} = componentsOfTransaction({
      transaction: funding.transaction,
    });

    const utxos = [200000, 100000].map(value => ({
      tokens: value,
      transaction_id: funding.id,
      transaction_vout: outputs.findIndex(output => {
        const isShared = output.script === address.output_script;

        return isShared && output.tokens === value;
      }),
    }));

    // Make the swap HTLC that the utxos move into
    const clientHtlcKey = makePrivateKey({}).private_key;
    const height = (await getHeight({lnd: client.lnd})).current_block_height;
    const secret = randomBytes(32);

    const {script} = swapScriptV2({
      claim_public_key: swapKey({private_key: makePrivateKey({}).private_key})
        .public_key,
      hash: sha256(secret),
      refund_public_key: swapKey({private_key: clientHtlcKey}).public_key,
      timeout: height + timeoutDelta,
    });

    // Begin a server signing session for the shared address
    const beginSession = async () => {
      const session = await beginGroupSigningSession({
        key_family: family,
        key_index: serverKey.index,
        lnd: server.lnd,
        public_keys: [clientKey.public_key],
        root_hash: address.root_hash,
      });

      equal(
        session.external_key,
        address.output_script.slice(4),
        'Server signing session key is the shared address key'
      );

      return session;
    };

    // The server makes its signing sessions and nonces first
    const serverSessions = {};

    await asyncEachSeries(swapInFallbacks, async ({type}) => {
      const sessions = await asyncTimesSeries(utxos.length, beginSession);

      serverSessions[type] = sessions;

      return;
    });

    const fallbacks = swapInFallbacks.map(({type}) => ({
      type,
      fee_tokens_per_kw: rates[type],
      nonces: serverSessions[type].map(session => session.nonce),
    }));

    const pushes = [];

    const signed = await signSwapInServiceFallback({
      utxos,
      expiry,
      fallbacks,
      network,
      script,
      tokens,
      id: sha256(secret),
      key_family: family,
      key_index: clientKey.index,
      lnd: client.lnd,
      metadata: {},
      service: {
        pushStaticAddressHtlcSigs: (req, metadata, cbk) => {
          pushes.push(req);

          return cbk();
        },
      },
      service_public_key: serverKey.public_key,
    });

    equal(pushes.length, 1, 'Signatures are pushed to the server');

    const [push] = pushes;

    // The server combines the client signatures with its own signatures
    const fallbackTransactions = {};

    await asyncEachSeries(swapInFallbacks, async ({info, type}) => {
      const sessions = serverSessions[type];

      const unsigned = swapInServiceFallbackTx({
        utxos,
        script,
        tokens,
        fee_tokens_per_kw: rates[type],
        output_script: address.output_script,
      });

      // Combine the signatures of each input
      const witnesses = await asyncTimesSeries(sessions.length, async vin => {
        const session = sessions[vin];

        await updateGroupSigningSession({
          hash: unsigned.hashes[vin],
          id: session.id,
          lnd: server.lnd,
          nonces: [bufferAsHex(push[info].nonces[vin])],
        });

        const {signature} = await endGroupSigningSession({
          id: session.id,
          lnd: server.lnd,
          signatures: [bufferAsHex(push[info].sigs[vin])],
        });

        const isValid = verifySchnorr(
          hexAsBuffer(unsigned.hashes[vin]),
          hexAsBuffer(address.output_script.slice(4)),
          hexAsBuffer(signature)
        );

        equal(isValid, true, 'Combined signature is valid for the utxo');

        return [signature];
      });

      const tx = componentsOfTransaction({transaction: unsigned.transaction});

      const {transaction} = encodeTransaction({
        inputs: tx.inputs.map((input, i) => ({
          id: input.id,
          script: input.script,
          sequence: input.sequence,
          vout: input.vout,
          witness: witnesses[i],
        })),
        locktime: tx.locktime,
        outputs: tx.outputs,
        version: tx.version,
      });

      const fallback = signed.transactions.find(n => n.type === type);

      equal(idForTransaction({transaction}).id, fallback.id, 'Got HTLC tx id');

      fallbackTransactions[type] = transaction;

      return;
    });

    // The server publishes the standard HTLC transaction
    await broadcastTransaction({
      lnd: client.lnd,
      transaction: fallbackTransactions.standard,
    });

    // The client refunds the HTLC after it times out
    await client.generate({count: timeoutDelta});

    const fallback = componentsOfTransaction({
      transaction: fallbackTransactions.standard,
    });

    const [htlcOutput, change] = fallback.outputs;

    equal(change.script, address.output_script, 'Change goes to the address');

    const refund = refundTransaction({
      network,
      block_height: height + timeoutDelta,
      fee_tokens_per_vbyte: feeRate,
      private_key: clientHtlcKey,
      sweep_address: (await createChainAddress({lnd: client.lnd})).address,
      tokens: htlcOutput.tokens,
      transaction_id: idForTransaction({
        transaction: fallbackTransactions.standard,
      }).id,
      transaction_vout: Number(),
      witness_script: script,
    });

    await broadcastTransaction({
      lnd: client.lnd,
      transaction: refund.transaction,
    });

    const refundId = idForTransaction({transaction: refund.transaction}).id;

    // Wait for the refund to confirm
    await asyncRetry({interval, times}, async () => {
      await client.generate({});

      const {utxos} = await getUtxos({lnd: client.lnd});

      const utxo = utxos.find(n => n.transaction_id === refundId);

      if (!utxo || !utxo.confirmation_count) {
        throw new Error('ExpectedHtlcRefundConfirmed');
      }
    });
  } catch (err) {
    equal(err, null, 'Expected no error');
  } finally {
    await kill({});
  }

  return;
});

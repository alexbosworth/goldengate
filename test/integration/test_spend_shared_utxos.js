const {deepEqual} = require('node:assert').strict;
const {equal} = require('node:assert').strict;
const test = require('node:test');

const asyncRetry = require('async/retry');
const asyncTimesSeries = require('async/timesSeries');
const {beginGroupSigningSession} = require('ln-service');
const {componentsOfTransaction} = require('@alexbosworth/blockchain');
const {createChainAddress} = require('ln-service');
const {decodePsbt} = require('psbt');
const {endGroupSigningSession} = require('ln-service');
const {getChainTransactions} = require('ln-service');
const {getPublicKey} = require('ln-service');
const {getUtxos} = require('ln-service');
const {idForTransaction} = require('@alexbosworth/blockchain');
const {sendToChainOutputScripts} = require('ln-service');
const {spawnLightningCluster} = require('ln-docker-daemons');
const {updateGroupSigningSession} = require('ln-service');
const {v1HashToSign} = require('p2tr');

const {broadcastTransaction} = require('./../../');
const {sharedAddressScript} = require('./../../');
const {spendSharedUtxos} = require('./../../');

const bufferAsHex = buffer => buffer.toString('hex');
const dustExcess = 400;
const expiry = 14400;
const family = 42060;
const feeRate = 2;
const hexAsBuffer = hex => Buffer.from(hex, 'hex');
const interval = 10;
const maturity = 100;
const network = 'btcregtest';
const outpoint = n => `${n.id}:${n.vout}`;
const size = 2;
const times = 2000;
const tokens = 210000;

// Spending shared utxos sends change to the address, or to fees when dust
test(`Spend shared address utxos`, async () => {
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

    // The server signs for its key on every utxo in the spend PSBT
    const serverSign = async req => {
      const psbt = decodePsbt({psbt: bufferAsHex(req.withdrawal_psbt)});

      const transaction = psbt.unsigned_transaction;

      const spends = psbt.inputs.map(input => ({
        script: input.witness_utxo.script_pub,
        tokens: input.witness_utxo.tokens,
      }));

      const tx = componentsOfTransaction({transaction});

      const signingInfo = {};

      // Each input is cosigned with a signing session of its own
      await asyncTimesSeries(tx.inputs.length, async vin => {
        const input = tx.inputs[vin];

        const session = await beginGroupSigningSession({
          key_family: family,
          key_index: serverKey.index,
          lnd: server.lnd,
          public_keys: [clientKey.public_key],
          root_hash: address.root_hash,
        });

        const {hash} = v1HashToSign({spends, transaction, vin, sighash: 0});

        const {signature} = await updateGroupSigningSession({
          hash,
          id: session.id,
          lnd: server.lnd,
          nonces: [bufferAsHex(req.deposit_to_nonces[outpoint(input)])],
        });

        await endGroupSigningSession({id: session.id, lnd: server.lnd});

        signingInfo[outpoint(input)] = {
          nonce: hexAsBuffer(session.nonce),
          sig: hexAsBuffer(signature),
        };

        return;
      });

      const {id} = idForTransaction({transaction});

      return {signing_info: signingInfo, txid: hexAsBuffer(id).reverse()};
    };

    const service = {
      serverPsbtWithdrawDeposits: (req, metadata, cbk) => {
        return serverSign(req).then(res => cbk(null, res), err => cbk(err));
      },
    };

    const {address: sweepAddress} = await createChainAddress({
      lnd: client.lnd,
    });

    const spend = await spendSharedUtxos({
      utxos,
      expiry,
      network,
      service,
      tokens,
      fee_tokens_per_vbyte: feeRate,
      key_family: family,
      key_index: clientKey.index,
      lnd: client.lnd,
      metadata: {},
      service_public_key: serverKey.public_key,
      sweep_address: sweepAddress,
    });

    const [, change] = componentsOfTransaction({
      transaction: spend.transaction,
    }).outputs;

    equal(change.script, address.output_script, 'Change goes to the address');

    await broadcastTransaction({
      lnd: client.lnd,
      transaction: spend.transaction,
    });

    // Wait for the spend to confirm
    const received = await asyncRetry({interval, times}, async () => {
      await client.generate({});

      const {utxos} = await getUtxos({lnd: client.lnd});

      const utxo = utxos.find(n => n.transaction_id === spend.id);

      if (!utxo || !utxo.confirmation_count) {
        throw new Error('ExpectedSpendConfirmed');
      }

      return utxo;
    });

    equal(received.tokens, tokens, 'Client received the spent tokens');

    const {outputs: spendOutputs} = componentsOfTransaction({
      transaction: spend.transaction,
    });

    const changeUtxo = {
      tokens: change.tokens,
      transaction_id: spend.id,
      transaction_vout: spendOutputs.findIndex(output => {
        return output.script === address.output_script;
      }),
    };

    // Spend the change, leaving too little for change that is not dust
    const dustSpend = await spendSharedUtxos({
      expiry,
      network,
      service,
      fee_tokens_per_vbyte: feeRate,
      key_family: family,
      key_index: clientKey.index,
      lnd: client.lnd,
      metadata: {},
      service_public_key: serverKey.public_key,
      sweep_address: sweepAddress,
      tokens: changeUtxo.tokens - dustExcess,
      utxos: [changeUtxo],
    });

    const [dustSpendOutput, ...dustChange] = componentsOfTransaction({
      transaction: dustSpend.transaction,
    }).outputs;

    deepEqual(dustChange, [], 'Dust change is not an output');

    equal(
      dustSpendOutput.tokens,
      changeUtxo.tokens - dustExcess,
      'Spend pays the tokens and the dust change goes to fees'
    );

    await broadcastTransaction({
      lnd: client.lnd,
      transaction: dustSpend.transaction,
    });

    // Wait for the spend with dust change to confirm
    const dustReceived = await asyncRetry({interval, times}, async () => {
      await client.generate({});

      const {utxos} = await getUtxos({lnd: client.lnd});

      const utxo = utxos.find(n => n.transaction_id === dustSpend.id);

      if (!utxo || !utxo.confirmation_count) {
        throw new Error('ExpectedDustChangeSpendConfirmed');
      }

      return utxo;
    });

    equal(dustReceived.tokens, dustSpendOutput.tokens, 'Client got tokens');
  } catch (err) {
    equal(err, null, 'Expected no error');
  } finally {
    await kill({});
  }

  return;
});

const {equal} = require('node:assert').strict;
const {rejects} = require('node:assert').strict;
const test = require('node:test');

const asyncRetry = require('async/retry');
const asyncTimesSeries = require('async/timesSeries');
const {beginGroupSigningSession} = require('ln-service');
const {componentsOfTransaction} = require('@alexbosworth/blockchain');
const {createChainAddress} = require('ln-service');
const {createInvoice} = require('ln-service');
const {createPsbt} = require('psbt');
const {decodePsbt} = require('psbt');
const {endGroupSigningSession} = require('ln-service');
const {getChainTransactions} = require('ln-service');
const {getHeight} = require('ln-service');
const {getPublicKey} = require('ln-service');
const {getUtxos} = require('ln-service');
const {idForTransaction} = require('@alexbosworth/blockchain');
const {outputScriptForAddress} = require('@alexbosworth/blockchain');
const {pay} = require('ln-service');
const {sendToChainOutputScripts} = require('ln-service');
const {setupChannel} = require('ln-docker-daemons');
const {spawnLightningCluster} = require('ln-docker-daemons');
const {updateGroupSigningSession} = require('ln-service');
const {v1HashToSign} = require('p2tr');
const {verifySchnorr} = require('tiny-secp256k1');

const {broadcastTransaction} = require('./../../');
const {encodeTransaction} = require('./../../transactions');
const {sharedAddressScript} = require('./../../');
const {signSwapInCoopSettlement} = require('./../../');
const {waitForSameChainTip} = require('./../macros');

const bufferAsHex = buffer => buffer.toString('hex');
const expiry = 14400;
const family = 42060;
const feeRate = 2;
const hexAsBuffer = hex => Buffer.from(hex, 'hex');
const interval = 10;
const maturity = 100;
const network = 'btcregtest';
const outpoint = n => `${n.transaction_id}:${n.transaction_vout}`;
const shortchangeTokens = 1000;
const size = 2;
const sweepFee = 5000;
const times = 2000;
const tokens = 251000;

// Cosigning a sweep of paid shared address utxos should sweep the utxos
test(`Sign swap in sweep`, async () => {
  const {kill, nodes} = await spawnLightningCluster({size});

  const [client, server] = nodes;

  const lnds = [client.lnd, server.lnd];

  try {
    await client.generate({count: maturity});

    // The server mines its blocks on top of the client blocks
    await waitForSameChainTip({lnds});

    // The server pays the swap with a channel to the client
    await setupChannel({
      generate: server.generate,
      lnd: server.lnd,
      to: client,
    });

    // The client mines its blocks on top of the server blocks
    await waitForSameChainTip({lnds});

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
    const confirmed = await asyncRetry({interval, times}, async () => {
      await client.generate({});

      const {transactions} = await getChainTransactions({lnd: client.lnd});

      const tx = transactions.find(n => n.id === funding.id);

      if (!tx || !tx.is_confirmed) {
        throw new Error('ExpectedSharedUtxosConfirmed');
      }

      return tx;
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

    // The client is paid for the swap with a payment to its invoice
    const invoice = await createInvoice({tokens, lnd: client.lnd});

    const swap = {utxos, tokens, id: invoice.id};

    // The server sweeps the swap tokens and sends change back to the address
    const {address: sweepAddress} = await createChainAddress({
      lnd: server.lnd,
    });

    const sweepScript = outputScriptForAddress({
      network,
      address: sweepAddress,
    }).script;

    const {psbt} = createPsbt({
      outputs: [
        {script: sweepScript, tokens: tokens - sweepFee},
        {script: address.output_script, tokens: 300000 - tokens},
      ],
      utxos: utxos.map(utxo => ({
        id: utxo.transaction_id,
        vout: utxo.transaction_vout,
      })),
    });

    const prevouts = utxos.map(utxo => {
      return {...utxo, script: address.output_script};
    });

    const spends = prevouts.map(n => ({script: n.script, tokens: n.tokens}));

    // The server makes a signing session and nonce for each utxo
    const sessions = await asyncTimesSeries(utxos.length, async () => {
      return await beginGroupSigningSession({
        key_family: family,
        key_index: serverKey.index,
        lnd: server.lnd,
        public_keys: [clientKey.public_key],
        root_hash: address.root_hash,
      });
    });

    const nonces = utxos.map((n, i) => ({...n, nonce: sessions[i].nonce}));
    const pushes = [];

    const settlement = {
      expiry,
      network,
      nonces,
      prevouts,
      psbt,
      id: swap.id,
      key_family: family,
      key_index: clientKey.index,
      lnd: client.lnd,
      metadata: {},
      service: {
        pushStaticAddressSweeplessSigs: (req, metadata, cbk) => {
          pushes.push(req);

          return cbk();
        },
      },
      service_public_key: serverKey.public_key,
      swaps: [swap],
    };

    // The client does not cosign the settlement before the swap is paid
    await rejects(
      signSwapInCoopSettlement(settlement),
      [425, 'ExpectedPaidSwapToSignSettlement'],
      'An unpaid swap is not cosigned'
    );

    equal(pushes.length, 0, 'No signatures are pushed for an unpaid swap');

    // The server pays the swap once the channel is ready to use
    await asyncRetry({interval, times}, async () => {
      return await pay({lnd: server.lnd, request: invoice.request});
    });

    // The server makes a sweep that pays itself some of the client change
    const shortchanged = createPsbt({
      outputs: [
        {script: sweepScript, tokens: tokens - sweepFee + shortchangeTokens},
        {
          script: address.output_script,
          tokens: 300000 - tokens - shortchangeTokens,
        },
      ],
      utxos: utxos.map(utxo => ({
        id: utxo.transaction_id,
        vout: utxo.transaction_vout,
      })),
    });

    // The client does not cosign a sweep that does not pay all of its change
    await rejects(
      signSwapInCoopSettlement({...settlement, psbt: shortchanged.psbt}),
      [400, 'ExpectedChangeToSharedAddress'],
      'A sweep that shortchanges the client is not cosigned'
    );

    equal(pushes.length, 0, 'No signatures are pushed for a short change');

    const signed = await signSwapInCoopSettlement(settlement);

    const [push] = pushes;

    const transaction = decodePsbt({psbt}).unsigned_transaction;

    // The server combines its signatures with the client signatures
    const witnesses = await asyncTimesSeries(utxos.length, async vin => {
      const info = push.signing_info[outpoint(utxos[vin])];

      const {hash} = v1HashToSign({spends, transaction, vin, sighash: 0});

      await updateGroupSigningSession({
        hash,
        id: sessions[vin].id,
        lnd: server.lnd,
        nonces: [bufferAsHex(info.nonce)],
      });

      const {signature} = await endGroupSigningSession({
        id: sessions[vin].id,
        lnd: server.lnd,
        signatures: [bufferAsHex(info.sig)],
      });

      const isValid = verifySchnorr(
        hexAsBuffer(hash),
        hexAsBuffer(address.output_script.slice(4)),
        hexAsBuffer(signature)
      );

      equal(isValid, true, 'Combined signature is valid for the utxo');

      return [signature];
    });

    const tx = componentsOfTransaction({transaction});

    const sweep = encodeTransaction({
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

    const sweepId = idForTransaction({transaction: sweep.transaction}).id;

    equal(sweepId, signed.transaction_id, 'Got sweep transaction id');

    // Wait for the server to see the funding block before it publishes
    await asyncRetry({interval, times}, async () => {
      const height = await getHeight({lnd: server.lnd});

      if (height.current_block_height < confirmed.confirmation_height) {
        throw new Error('ExpectedServerSyncedToFundingBlock');
      }
    });

    await broadcastTransaction({
      lnd: server.lnd,
      transaction: sweep.transaction,
    });

    // Wait for the server to receive the swept utxos
    const received = await asyncRetry({interval, times}, async () => {
      await client.generate({});

      const {utxos} = await getUtxos({lnd: server.lnd});

      const utxo = utxos.find(n => n.transaction_id === sweepId);

      if (!utxo || !utxo.confirmation_count) {
        throw new Error('ExpectedSweepConfirmed');
      }

      return utxo;
    });

    equal(received.tokens, tokens - sweepFee, 'Server received swap tokens');
  } catch (err) {
    equal(err, null, 'Expected no error');
  } finally {
    await kill({});
  }

  return;
});

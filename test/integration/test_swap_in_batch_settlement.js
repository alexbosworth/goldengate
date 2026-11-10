const {deepEqual} = require('node:assert').strict;
const {equal} = require('node:assert').strict;
const {rejects} = require('node:assert').strict;
const test = require('node:test');

const asyncEachSeries = require('async/eachSeries');
const asyncMapSeries = require('async/mapSeries');
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
const {getSharedUtxos} = require('./../../');
const {sharedAddressScript} = require('./../../');
const {signSwapInCoopSettlement} = require('./../../');
const {waitForSameChainTip} = require('./../macros');

const bufferAsHex = buffer => buffer.toString('hex');
const expiry = 14400;
const family = 42060;
const feeRate = 2;
const flatten = arr => [].concat(...arr);
const hexAsBuffer = hex => Buffer.from(hex, 'hex');
const interval = 10;
const maturity = 100;
const network = 'btcregtest';
const outpoint = n => `${n.transaction_id}:${n.transaction_vout}`;
const sighashDefault = 0;
const size = 2;
const sumOf = utxos => utxos.reduce((sum, n) => sum + n.tokens, 0);
const sweepFee = 10000;
const taprootKey = outputScript => outputScript.slice(4);
const times = 2000;
const tokens = {first: 250000, other: 100000, second: 120000};
const utxosTokens = {
  first: [200000, 100000],
  other: [120000],
  second: [150000],
};

// A batched sweep of several swaps pays each client its change in one output
test(`Sign batched swap in sweep`, async () => {
  const {kill, nodes} = await spawnLightningCluster({size});

  const [client, server] = nodes;

  const lnds = [client.lnd, server.lnd];

  try {
    await client.generate({count: maturity});

    // The server mines its blocks on top of the client blocks
    await waitForSameChainTip({lnds});

    // The server pays the swaps with a channel to the client
    await setupChannel({
      generate: server.generate,
      lnd: server.lnd,
      to: client,
    });

    // The client mines its blocks on top of the server blocks
    await waitForSameChainTip({lnds});

    // The client has a shared address and another client has one too
    const clientKey = await getPublicKey({family, lnd: client.lnd});
    const otherKey = await getPublicKey({family, lnd: client.lnd});
    const serverKey = await getPublicKey({family, lnd: server.lnd});

    const addressFor = key => sharedAddressScript({
      expiry,
      network,
      client_public_key: key.public_key,
      server_public_key: serverKey.public_key,
    });

    const address = addressFor(clientKey);
    const otherAddress = addressFor(otherKey);

    const start = await getHeight({lnd: client.lnd});

    // Make utxos for two swaps of the client and a swap of the other client
    const sends = [
      {output: address, values: utxosTokens.first},
      {output: address, values: utxosTokens.second},
      {output: otherAddress, values: utxosTokens.other},
    ];

    const funding = await sendToChainOutputScripts({
      fee_tokens_per_vbyte: feeRate,
      lnd: client.lnd,
      send_to: flatten(sends.map(({output, values}) => {
        return values.map(value => ({
          script: output.output_script,
          tokens: value,
        }));
      })),
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

    // Utxo values are different, so each utxo can be told apart
    const utxoFor = value => ({
      tokens: value,
      transaction_id: funding.id,
      transaction_vout: outputs.findIndex(n => n.tokens === value),
    });

    // A swap is paid with an invoice of the client
    const makeSwap = async type => {
      const invoice = await createInvoice({
        lnd: client.lnd,
        tokens: tokens[type],
      });

      return {
        id: invoice.id,
        request: invoice.request,
        tokens: tokens[type],
        utxos: utxosTokens[type].map(utxoFor),
      };
    };

    const first = await makeSwap('first');
    const other = await makeSwap('other');
    const second = await makeSwap('second');

    // The server pays every swap once the channel is ready to use
    await asyncEachSeries([first, second, other], async ({request}) => {
      return await asyncRetry({interval, times}, async () => {
        return await pay({request, lnd: server.lnd});
      });
    });

    // The server sweeps the utxos of every swap in one transaction
    const swaps = [first, second, other];

    const utxos = flatten(swaps.map(swap => swap.utxos));

    const {address: sweepAddress} = await createChainAddress({
      lnd: server.lnd,
    });

    const sweepScript = outputScriptForAddress({
      network,
      address: sweepAddress,
    });

    // Each client gets the change of all of its swaps in a single output
    const clientUtxos = first.utxos.concat(second.utxos);

    const clientChange = sumOf(clientUtxos) - first.tokens - second.tokens;

    const otherChange = sumOf(other.utxos) - other.tokens;

    const {psbt} = createPsbt({
      outputs: [
        {script: sweepScript.script, tokens: sumOf(swaps) - sweepFee},
        {script: address.output_script, tokens: clientChange},
        {script: otherAddress.output_script, tokens: otherChange},
      ],
      utxos: utxos.map(utxo => ({
        id: utxo.transaction_id,
        vout: utxo.transaction_vout,
      })),
    });

    // The utxos of the other client are in the other shared address
    const isOther = utxo => other.utxos.includes(utxo);

    const addressOf = utxo => isOther(utxo) ? otherAddress : address;
    const keyOf = utxo => isOther(utxo) ? otherKey : clientKey;

    const prevouts = utxos.map(utxo => ({
      ...utxo,
      script: addressOf(utxo).output_script,
    }));

    const spends = prevouts.map(n => ({script: n.script, tokens: n.tokens}));

    // The server makes a signing session for each utxo with its client
    const sessions = await asyncMapSeries(utxos, async utxo => {
      return await beginGroupSigningSession({
        key_family: family,
        key_index: serverKey.index,
        lnd: server.lnd,
        public_keys: [keyOf(utxo).public_key],
        root_hash: addressOf(utxo).root_hash,
      });
    });

    const pushes = [];

    // The details of a swap that a client cosigns a sweep with
    const asSwap = n => ({id: n.id, tokens: n.tokens, utxos: n.utxos});

    // Get the arguments for a client to cosign the sweep for one of its swaps
    const settlement = ({key, swap, unsettled}) => ({
      expiry,
      network,
      prevouts,
      psbt,
      id: swap.id,
      key_family: family,
      key_index: key.index,
      lnd: client.lnd,
      metadata: {},
      nonces: swap.utxos.map(utxo => ({
        nonce: sessions[utxos.indexOf(utxo)].nonce,
        transaction_id: utxo.transaction_id,
        transaction_vout: utxo.transaction_vout,
      })),
      service: {
        pushStaticAddressSweeplessSigs: (req, metadata, cbk) => {
          pushes.push(req);

          return cbk();
        },
      },
      service_public_key: serverKey.public_key,
      swaps: unsettled.map(asSwap),
    });

    // A client that leaves an unsettled swap in the sweep out does not cosign
    await rejects(
      signSwapInCoopSettlement(settlement({
        key: clientKey,
        swap: first,
        unsettled: [first],
      })),
      [400, 'UnexpectedUnknownUtxoInCoopSettlement'],
      'Cosigning a batch needs every unsettled swap of the client'
    );

    equal(pushes.length, 0, 'No signatures are pushed for a missing swap');

    // The client cosigns each of its swaps in the sweep
    const signed = [
      await signSwapInCoopSettlement(settlement({
        key: clientKey,
        swap: first,
        unsettled: [first, second],
      })),
      await signSwapInCoopSettlement(settlement({
        key: clientKey,
        swap: second,
        unsettled: [first, second],
      })),
      // The other client cosigns its own swap in the sweep
      await signSwapInCoopSettlement(settlement({
        key: otherKey,
        swap: other,
        unsettled: [other],
      })),
    ];

    equal(pushes.length, swaps.length, 'Signatures are pushed for each swap');

    // The server combines its signatures with the client signatures
    const signingInfo = pushes.reduce((sum, push) => {
      return Object.assign(sum, push.signing_info);
    },
    {});

    const transaction = decodePsbt({psbt}).unsigned_transaction;

    // Combine the signatures of each utxo
    const witnesses = await asyncTimesSeries(utxos.length, async vin => {
      const info = signingInfo[outpoint(utxos[vin])];

      const {hash} = v1HashToSign({
        spends,
        transaction,
        vin,
        sighash: sighashDefault,
      });

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
        hexAsBuffer(taprootKey(prevouts[vin].script)),
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

    deepEqual(
      signed.map(n => n.transaction_id),
      swaps.map(() => sweepId),
      'Every swap is cosigned in the same sweep'
    );

    // The server has the client blocks before it publishes and mines
    await waitForSameChainTip({lnds});

    await broadcastTransaction({
      lnd: server.lnd,
      transaction: sweep.transaction,
    });

    // Wait for the server to receive the swept utxos
    const received = await asyncRetry({interval, times}, async () => {
      await server.generate({});

      const {utxos} = await getUtxos({lnd: server.lnd});

      const utxo = utxos.find(n => n.transaction_id === sweepId);

      if (!utxo || !utxo.confirmation_count) {
        throw new Error('ExpectedBatchSweepConfirmed');
      }

      return utxo;
    });

    equal(received.tokens, sumOf(swaps) - sweepFee, 'Server swept the swaps');

    // Each client is left with the change of its swaps as a single utxo
    const changeOf = async ({change, output}) => {
      return await asyncRetry({interval, times}, async () => {
        const {utxos} = await getSharedUtxos({
          network,
          address: output.address,
          lnd: client.lnd,
          min_height: start.current_block_height,
        });

        // The client sees the sweep spend the swap utxos
        if (utxos.some(n => n.transaction_id === funding.id)) {
          throw new Error('ExpectedSwapUtxosSwept');
        }

        const left = utxos.map(utxo => ({
          tokens: utxo.tokens,
          transaction_id: utxo.transaction_id,
        }));

        deepEqual(
          left,
          [{tokens: change, transaction_id: sweepId}],
          'The change of the swaps is the utxo left'
        );
      });
    };

    await changeOf({change: clientChange, output: address});
    await changeOf({change: otherChange, output: otherAddress});
  } catch (err) {
    equal(err, null, 'Expected no error');
  } finally {
    await kill({});
  }

  return;
});

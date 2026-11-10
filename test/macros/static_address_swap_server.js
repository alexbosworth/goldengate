const asyncEachSeries = require('async/eachSeries');
const asyncTimesSeries = require('async/timesSeries');
const {beginGroupSigningSession} = require('ln-service');
const {componentsOfTransaction} = require('@alexbosworth/blockchain');
const {createPsbt} = require('psbt');
const {decodePsbt} = require('psbt');
const {endGroupSigningSession} = require('ln-service');
const {getHeight} = require('ln-service');
const {getPublicKey} = require('ln-service');
const {idForTransaction} = require('@alexbosworth/blockchain');
const {outputScriptForAddress} = require('@alexbosworth/blockchain');
const {sizeOfTransaction} = require('@alexbosworth/blockchain');
const {updateGroupSigningSession} = require('ln-service');
const {v1HashToSign} = require('p2tr');
const {verifySchnorr} = require('tiny-secp256k1');

const {addressForScript} = require('./../../script');
const {encodeTransaction} = require('./../../transactions');
const grpcSwapServer = require('./grpc_swap_server');
const {makePrivateKey} = require('./../../script');
const {sharedAddressScript} = require('./../../script');
const swapKey = require('./../../script/get_public_key');
const {swapScriptV2} = require('./../../script');

const abandonedSwapMessage = 'client did not provide fallback tx signatures';
const bufferAsHex = buffer => Buffer.from(buffer).toString('hex');
const defaultMaxTokens = 1e7;
const defaultMinTokens = 1e4;
const emptyScript = '';
const {floor} = Math;
const hexAsBuffer = hex => Buffer.from(hex, 'hex');
const htlcTypes = [
  {info: 'standard_htlc_info', rate: 2500, type: 'standard'},
  {info: 'high_fee_htlc_info', rate: 5000, type: 'high'},
  {info: 'extreme_fee_htlc_info', rate: 10000, type: 'extreme'},
];
const locktime = 0;
const methodNames = [
  'loopInQuote',
  'loopInTerms',
  'pushStaticAddressHtlcSigs',
  'pushStaticAddressSweeplessSigs',
  'serverNewAddress',
  'serverPsbtWithdrawDeposits',
  'serverStaticAddressLoopIn',
  'subscribeNotifications',
];
const outpoint = n => `${n.transaction_id}:${n.transaction_vout}`;
const placeholderSignature = Buffer.alloc(64).toString('hex');
const reversed = buffer => Buffer.from(buffer).reverse();
const sequence = 0;
const sighashDefault = 0;
const sumOf = utxos => utxos.reduce((sum, n) => sum + n.tokens, 0);
const taprootKey = outputScript => outputScript.slice(4);
const version = 2;
const weightUnitsPerKw = 1e3;
const xOnlyKey = key => key.length === 66 ? key.slice(2) : key;

// Make an HTLC transaction like the service, paying its fee from the HTLC
const htlcTransaction = args => {
  const change = sumOf(args.utxos) - args.tokens;

  const changeOutputs = !change ? [] : [{
    script: args.output_script,
    tokens: change,
  }];

  const inputs = args.utxos.map(utxo => ({
    sequence,
    id: utxo.transaction_id,
    script: emptyScript,
    vout: utxo.transaction_vout,
  }));

  const htlcOutput = {script: args.htlc_script, tokens: args.tokens};

  // Key spend signatures have a fixed size, so the weight is known unsigned
  const {weight} = sizeOfTransaction({
    transaction: encodeTransaction({
      locktime,
      version,
      inputs: inputs.map(n => ({...n, witness: [placeholderSignature]})),
      outputs: [htlcOutput].concat(changeOutputs),
    }).transaction,
  });

  const fee = floor(args.fee_rate * weight / weightUnitsPerKw);

  const outputs = [{...htlcOutput, tokens: args.tokens - fee}];

  return {fee, inputs, outputs: outputs.concat(changeOutputs)};
};

// Encode a transaction with witnesses for its inputs
const withWitnesses = ({inputs, outputs, witnesses}) => {
  return encodeTransaction({
    locktime,
    outputs,
    version,
    inputs: inputs.map((input, vin) => ({...input, witness: witnesses[vin]})),
  });
};

/** Start a static address swap server that signs with an LND, over gRPC

  The server makes its own transactions and makes and combines its MuSig2
  signatures with its LND, like the Lightning Labs swap service does, so that
  clients can swap with it through the real swap service gRPC interface

  The server learns about utxos sent to the shared address through `addUtxos`
  since it does not watch the chain

  A client can defer cosigning a sweep, then `resendSweep` asks it again

  A service that gives bad swap terms is made with `changeNextSwapResponse`,
  which changes the response to the next swap request

  {
    cltv_delta: <Swap HTLC Timeout Height Delta Blocks Number>
    expiry: <Shared Address Expiry Blocks Count Number>
    fee: <Swap Fee Tokens Number>
    key_family: <Service Key Family Number>
    lnd: <Service Authenticated LND API Object>
    [max_tokens]: <Maximum Swap Tokens Number>
    [min_tokens]: <Minimum Swap Tokens Number>
    network: <Network Name String>
  }

  @returns via Promise
  {
    addUtxos: <Add Shared Address Utxos Function> ({utxos}) => {}
    cert: <Base64 Encoded TLS Certificate String>
    changeNextSwapResponse: <Change Next Swap Response Function> (change) => {}
    htlc_private_key: <Service HTLC Claim Private Key Hex String>
    htlcs: <Get Signed HTLC Transactions Of Swap Function> ({id}) => [{
      fee: <HTLC Transaction Fee Tokens Number>
      id: <HTLC Transaction Id Hex String>
      transaction: <Signed HTLC Transaction Hex String>
      type: <HTLC Fee Rate Type String>
    }]
    notify: <Send Notification To Subscribers Function> (notification) => {}
    requests: {
      <Method Name String>: [<Request Object>]
    }
    resendSweep: <Ask Client Again To Cosign A Sweep Function> ({id}) => {}
    socket: <Server Socket String>
    stop: <Stop Server Function> () => {}
    subscribed: <Client Subscribed To Notifications Promise>
    sweep: <Cosign Sweep Of Swap Utxos Function> ({address, fee, id}) => {
      id: <Sweep Transaction Id Hex String>
      transaction: <Signed Sweep Transaction Hex String>
    }
  }
*/
module.exports = async args => {
  const changes = [];
  const client = {};
  const htlcPrivateKey = makePrivateKey({}).private_key;
  const keys = {};
  const known = {};
  const listening = {};
  const requests = methodNames.reduce((sum, n) => ({...sum, [n]: []}), {});
  const subscribers = [];
  const swaps = {};
  const sweeps = {};

  const htlcPublicKey = swapKey({private_key: htlcPrivateKey}).public_key;

  // Clients subscribe to notifications before the server sends any
  const subscribed = new Promise(resolve => listening.resolve = resolve);

  // The server key of shared addresses
  const getKey = () => {
    keys.server = keys.server || getPublicKey({
      family: args.key_family,
      lnd: args.lnd,
    });

    return keys.server;
  };

  // The shared address of the client
  const sharedAddress = async () => {
    const key = await getKey();

    return sharedAddressScript({
      client_public_key: client.public_key,
      expiry: args.expiry,
      network: args.network,
      server_public_key: key.public_key,
    });
  };

  // Begin a MuSig2 session to sign for the shared address with the client
  const beginSession = async () => {
    const [address, key] = await Promise.all([sharedAddress(), getKey()]);

    const session = await beginGroupSigningSession({
      key_family: args.key_family,
      key_index: key.index,
      lnd: args.lnd,
      public_keys: [client.public_key],
      root_hash: address.root_hash,
    });

    // The MuSig2 key of the LND has to be the key of the shared address
    if (xOnlyKey(session.external_key) !== taprootKey(address.output_script)) {
      throw new Error('ExpectedSharedAddressKeyForSigningSession');
    }

    return session;
  };

  // Combine a client signature with the signature of a server session
  const combine = async ({hash, nonce, session, signature}) => {
    const address = await sharedAddress();

    await updateGroupSigningSession({
      hash,
      id: session.id,
      lnd: args.lnd,
      nonces: [bufferAsHex(nonce)],
    });

    const combined = await endGroupSigningSession({
      id: session.id,
      lnd: args.lnd,
      signatures: [bufferAsHex(signature)],
    });

    const isValid = verifySchnorr(
      hexAsBuffer(hash),
      hexAsBuffer(taprootKey(address.output_script)),
      hexAsBuffer(combined.signature)
    );

    if (!isValid) {
      throw new Error('ExpectedValidSignatureForSharedAddressSpend');
    }

    return combined.signature;
  };

  // Sign the HTLC transaction of a fee rate with the client signatures
  const signHtlc = async ({address, htlc, request, spends, swap}) => {
    const {nonces, sigs} = request[htlc.info];
    const sessions = swap.sessions[htlc.type];

    const tx = htlcTransaction({
      fee_rate: htlc.rate,
      htlc_script: swap.htlc_script,
      output_script: address.output_script,
      tokens: swap.tokens,
      utxos: swap.utxos,
    });

    const unsigned = withWitnesses({...tx, witnesses: []}).transaction;

    // Combine the signatures of each input
    const witnesses = await asyncTimesSeries(sessions.length, async vin => {
      const {hash} = v1HashToSign({
        spends,
        vin,
        sighash: sighashDefault,
        transaction: unsigned,
      });

      const signature = await combine({
        hash,
        nonce: nonces[vin],
        session: sessions[vin],
        signature: sigs[vin],
      });

      return [signature];
    });

    const {transaction} = withWitnesses({...tx, witnesses});

    return {
      transaction,
      fee: tx.fee,
      id: idForTransaction({transaction}).id,
      type: htlc.type,
    };
  };

  // Sign a sweep with the client signatures for the swept utxos
  const signSweep = async ({request, sweep}) => {
    const address = await sharedAddress();
    const tx = componentsOfTransaction({transaction: sweep.transaction});

    const spends = sweep.utxos.map(utxo => ({
      script: address.output_script,
      tokens: utxo.tokens,
    }));

    // Combine the signatures of each swept utxo
    const witnesses = await asyncTimesSeries(sweep.utxos.length, async vin => {
      const info = request.signing_info[outpoint(sweep.utxos[vin])];

      if (!info) {
        throw new Error('ExpectedSignatureForEverySweptUtxo');
      }

      const {hash} = v1HashToSign({
        spends,
        vin,
        sighash: sighashDefault,
        transaction: sweep.transaction,
      });

      const signature = await combine({
        hash,
        nonce: info.nonce,
        session: sweep.sessions[vin],
        signature: info.sig,
      });

      return [signature];
    });

    return encodeTransaction({
      inputs: tx.inputs.map((input, vin) => ({
        id: input.id,
        script: input.script,
        sequence: input.sequence,
        vout: input.vout,
        witness: witnesses[vin],
      })),
      locktime: tx.locktime,
      outputs: tx.outputs,
      version: tx.version,
    });
  };

  // Send a notification to the clients that are subscribed
  const notify = notification => {
    return subscribers.forEach(subscriber => subscriber.write(notification));
  };

  const methods = {
    // Quote the swap fee
    loopInQuote: ({request}) => {
      requests.loopInQuote.push(request);

      return {cltv_delta: args.cltv_delta, swap_fee: String(args.fee)};
    },

    // Give the limits of the swap tokens of a swap
    loopInTerms: ({request}) => {
      requests.loopInTerms.push(request);

      return {
        max_swap_amount: String(args.max_tokens || defaultMaxTokens),
        min_swap_amount: String(args.min_tokens || defaultMinTokens),
      };
    },

    // Make signed HTLC transactions with the client HTLC signatures
    pushStaticAddressHtlcSigs: async ({request}) => {
      requests.pushStaticAddressHtlcSigs.push(request);

      const swap = swaps[bufferAsHex(request.swap_hash)];

      if (!swap) {
        throw new Error('ExpectedKnownSwapToPushHtlcSignaturesFor');
      }

      // A canceled swap can't be signed anymore
      if (!!swap.is_canceled) {
        throw new Error('ExpectedSwapThatIsNotCanceledToPushSignaturesFor');
      }

      // A push of no signatures abandons the swap, and the service says so
      if (!request.standard_htlc_info) {
        swap.is_canceled = true;

        throw new Error(abandonedSwapMessage);
      }

      const address = await sharedAddress();

      const spends = swap.utxos.map(utxo => ({
        script: address.output_script,
        tokens: utxo.tokens,
      }));

      // Combine the signatures of every HTLC transaction, failing on bad ones
      await asyncEachSeries(htlcTypes, async htlc => {
        const signed = await signHtlc({address, htlc, request, spends, swap});

        return swap.htlcs.push(signed);
      });

      return {};
    },

    // Make a signed sweep with the client sweep signatures
    pushStaticAddressSweeplessSigs: async ({request}) => {
      requests.pushStaticAddressSweeplessSigs.push(request);

      const sweep = sweeps[bufferAsHex(request.swap_hash)];

      if (!sweep) {
        throw new Error('ExpectedKnownSweepToPushSweepSignaturesFor');
      }

      try {
        // The client answers about the sweep that the server made
        if (!reversed(request.txid).equals(hexAsBuffer(sweep.id))) {
          throw new Error('ExpectedAnswerForSweepTransaction');
        }

        // A client that defers says why, and it is asked again later
        if (!!request.error_message) {
          return {};
        }

        const {transaction} = await signSweep({request, sweep});

        sweep.resolve({transaction, id: sweep.id});
      } catch (err) {
        sweep.reject(err);

        throw err;
      }

      return {};
    },

    // Make a shared address with the client key
    serverNewAddress: async ({request}) => {
      requests.serverNewAddress.push(request);

      client.public_key = bufferAsHex(request.client_key);

      const key = await getKey();

      return {
        params: {
          expiry: args.expiry,
          server_key: hexAsBuffer(key.public_key),
        },
      };
    },

    // Cosign a spend of shared address utxos that the client made
    serverPsbtWithdrawDeposits: async ({request}) => {
      requests.serverPsbtWithdrawDeposits.push(request);

      const address = await sharedAddress();

      const psbt = decodePsbt({psbt: bufferAsHex(request.withdrawal_psbt)});

      const spends = psbt.inputs.map(({witness_utxo}) => ({
        script: witness_utxo.script_pub,
        tokens: witness_utxo.tokens,
      }));

      // Only shared address utxos are cosigned
      if (spends.some(n => n.script !== address.output_script)) {
        throw new Error('ExpectedSharedAddressUtxosToCosignSpendOf');
      }

      const transaction = psbt.unsigned_transaction;

      const {inputs} = componentsOfTransaction({transaction});

      const signingInfo = {};

      // Each input is cosigned with a signing session of its own
      await asyncTimesSeries(inputs.length, async vin => {
        const key = `${inputs[vin].id}:${inputs[vin].vout}`;
        const session = await beginSession();

        const {hash} = v1HashToSign({
          spends,
          transaction,
          vin,
          sighash: sighashDefault,
        });

        const {signature} = await updateGroupSigningSession({
          hash,
          id: session.id,
          lnd: args.lnd,
          nonces: [bufferAsHex(request.deposit_to_nonces[key])],
        });

        await endGroupSigningSession({id: session.id, lnd: args.lnd});

        signingInfo[key] = {
          nonce: hexAsBuffer(session.nonce),
          sig: hexAsBuffer(signature),
        };

        return;
      });

      return {
        signing_info: signingInfo,
        txid: reversed(hexAsBuffer(idForTransaction({transaction}).id)),
      };
    },

    // Make a swap in of shared address utxos with signing sessions for HTLCs
    serverStaticAddressLoopIn: async ({request}) => {
      requests.serverStaticAddressLoopIn.push(request);

      const id = bufferAsHex(request.swap_hash);
      const utxos = request.deposit_outpoints.map(n => known[n]);

      if (utxos.some(utxo => !utxo)) {
        throw new Error('ExpectedKnownUtxosToSwapIn');
      }

      const height = await getHeight({lnd: args.lnd});

      const timeout = height.current_block_height + args.cltv_delta;

      // The service claims the HTLC with the preimage and the client refunds
      const {script} = swapScriptV2({
        timeout,
        claim_public_key: htlcPublicKey,
        hash: id,
        refund_public_key: bufferAsHex(request.htlc_client_pub_key),
      });

      const {address} = addressForScript({script, network: args.network});

      const sessions = {};

      // Every utxo has a signing session for every HTLC fee rate
      await asyncEachSeries(htlcTypes, async ({type}) => {
        sessions[type] = await asyncTimesSeries(utxos.length, beginSession);

        return;
      });

      swaps[id] = {
        sessions,
        timeout,
        utxos,
        htlc_script: outputScriptForAddress({
          address,
          network: args.network,
        }).script,
        htlcs: [],
        tokens: Number(request.amount) || sumOf(utxos),
      };

      const response = htlcTypes.reduce((sum, {info, rate, type}) => {
        sum[info] = {
          fee_rate: String(rate),
          nonces: sessions[type].map(session => hexAsBuffer(session.nonce)),
        };

        return sum;
      },
      {
        htlc_expiry: timeout,
        htlc_server_pub_key: hexAsBuffer(htlcPublicKey),
      });

      // A service that gives bad swap terms changes its response
      const change = changes.shift();

      return !change ? response : change(response);
    },

    // Keep the subscription of a client to send it notifications
    subscribeNotifications: ({call, request}) => {
      requests.subscribeNotifications.push(request);

      subscribers.push(call);

      call.on('cancelled', () => {
        return subscribers.splice(subscribers.indexOf(call), 1);
      });

      return listening.resolve();
    },
  };

  const server = await grpcSwapServer({methods});

  return {
    notify,
    requests,
    subscribed,
    addUtxos: ({utxos}) => utxos.forEach(n => known[outpoint(n)] = n),
    cert: server.cert,
    changeNextSwapResponse: change => changes.push(change),
    htlc_private_key: htlcPrivateKey,
    htlcs: ({id}) => swaps[id].htlcs,
    resendSweep: ({id}) => notify(sweeps[id].notification),
    socket: server.socket,
    stop: server.stop,

    // Make a sweep of the swap utxos and ask the client to cosign it
    sweep: async ({address, fee, id}) => {
      const shared = await sharedAddress();
      const swap = swaps[id];

      const change = sumOf(swap.utxos) - swap.tokens;

      const output = outputScriptForAddress({address, network: args.network});

      const sweepOutput = {script: output.script, tokens: swap.tokens - fee};

      // The swap change goes back to the shared address
      const changeOutputs = !change ? [] : [{
        script: shared.output_script,
        tokens: change,
      }];

      const {psbt} = createPsbt({
        version,
        outputs: [sweepOutput].concat(changeOutputs),
        utxos: swap.utxos.map(utxo => ({
          sequence,
          id: utxo.transaction_id,
          vout: utxo.transaction_vout,
        })),
      });

      const transaction = decodePsbt({psbt}).unsigned_transaction;

      // Every swept utxo has a signing session
      const sessions = await asyncTimesSeries(swap.utxos.length, beginSession);

      // Each swept utxo has the nonce of its signing session
      const depositToNonces = swap.utxos.reduce((sum, utxo, i) => {
        sum[outpoint(utxo)] = hexAsBuffer(sessions[i].nonce);

        return sum;
      },
      {});

      const prevoutInfo = swap.utxos.map(utxo => ({
        output_index: utxo.transaction_vout,
        pk_script: hexAsBuffer(shared.output_script),
        txid_bytes: reversed(hexAsBuffer(utxo.transaction_id)),
        value: String(utxo.tokens),
      }));

      // The notification asks the client to cosign the sweep
      const notification = {
        static_loop_in_sweep: {
          deposit_to_nonces: depositToNonces,
          prevout_info: prevoutInfo,
          swap_hash: hexAsBuffer(id),
          sweep_tx_psbt: hexAsBuffer(psbt),
        },
      };

      const signed = new Promise((resolve, reject) => {
        sweeps[id] = {
          notification,
          reject,
          resolve,
          sessions,
          transaction,
          id: idForTransaction({transaction}).id,
          utxos: swap.utxos,
        };
      });

      notify(notification);

      return await signed;
    },
  };
};

const asyncAuto = require('async/auto');
const asyncEachSeries = require('async/eachSeries');
const asyncify = require('async/asyncify');
const asyncMapSeries = require('async/mapSeries');
const {createPsbt} = require('psbt');
const {extendPsbt} = require('psbt');
const {getPublicKey} = require('ln-service');
const {idForTransaction} = require('@alexbosworth/blockchain');
const {outputScriptForAddress} = require('@alexbosworth/blockchain');
const {returnResult} = require('asyncjs-util');
const {sizeOfTransaction} = require('@alexbosworth/blockchain');
const {v1HashToSign} = require('p2tr');

const beginSession = require('./begin_spend_session');
const {encodeTransaction} = require('./../transactions');
const endSessions = require('./end_spend_sessions');
const finishSession = require('./finish_spend_session');
const {names} = require('./../conf/networks');
const {sharedAddressScript} = require('./../script');
const spendAmounts = require('./spend_amounts');

const asTx = components => encodeTransaction(components).transaction;
const bufferAsHex = buffer => buffer.toString('hex');
const {ceil} = Math;
const dustTokens = 546;
const emptyScript = '';
const hexAsBuffer = hex => Buffer.from(hex, 'hex');
const {isArray} = Array;
const {isBuffer} = Buffer;
const isFeeRate = n => Number.isFinite(n) && n > 0;
const isHash = n => !!n && /^[0-9A-F]{64}$/i.test(n);
const {isInteger} = Number;
const isNonce = n => Buffer.isBuffer(n) && n.length === 66;
const {isSafeInteger} = Number;
const isSig = n => Buffer.isBuffer(n) && n.length === 32;
const {keys} = Object;
const lockTime = 0;
const maxTokens = 21e14;
const maxVout = 4294967295;
const outpoint = n => `${n.transaction_id}:${n.transaction_vout}`;
const placeholderSignature = Buffer.alloc(64).toString('hex');
const reversed = buffer => Buffer.from(buffer).reverse();
const sequence = 0;
const sighashDefault = 0;
const sumOf = utxos => utxos.reduce((sum, n) => sum + n.tokens, 0);
const txVersion = 2;

/** Spend shared address utxos with the swap service

  With `tokens`, the remaining tokens go back to the shared address as change

  {
    utxos: [{
      tokens: <Utxo Tokens Number>
      transaction_id: <Utxo Transaction Id Hex String>
      transaction_vout: <Utxo Transaction Output Index Number>
    }]
    expiry: <Shared Address Expiry Blocks Count Number>
    fee_tokens_per_vbyte: <Fee Tokens Per Virtual Byte Number>
    key_family: <Shared Address Client Key Family Number>
    key_index: <Shared Address Client Key Index Number>
    lnd: <Authenticated LND API Object>
    metadata: <Authentication Metadata Object>
    network: <Network Name String>
    service: <Swap Service Object>
    service_public_key: <Shared Address Service Public Key Hex String>
    sweep_address: <Spend Tokens to Address String>
    [tokens]: <Spend Tokens Number>
  }

  @returns via cbk or Promise
  {
    id: <Spend Transaction Id Hex String>
    transaction: <Signed Spend Transaction Hex String>
  }
*/
module.exports = (args, cbk) => {
  return new Promise((resolve, reject) => {
    return asyncAuto({
      // Check arguments
      validate: cbk => {
        if (!isArray(args.utxos) || !args.utxos.length) {
          return cbk([400, 'ExpectedUtxosForSharedUtxosSpend']);
        }

        // A utxo has a transaction id, an output index and a value
        const isUtxo = utxo => {
          if (!utxo || !isHash(utxo.transaction_id)) {
            return false;
          }

          const vout = utxo.transaction_vout;

          if (!isInteger(vout) || vout < 0 || vout > maxVout) {
            return false;
          }

          return isSafeInteger(utxo.tokens) && utxo.tokens > 0;
        };

        if (!args.utxos.every(isUtxo)) {
          return cbk([400, 'ExpectedValidUtxosForSharedUtxosSpend']);
        }

        if (sumOf(args.utxos) > maxTokens) {
          return cbk([400, 'ExpectedValidUtxosForSharedUtxosSpend']);
        }

        // Outpoints are compared without regard to the case of the tx id
        const outpoints = args.utxos.map(n => outpoint(n).toLowerCase());

        if (new Set(outpoints).size !== outpoints.length) {
          return cbk([400, 'UnexpectedDuplicateUtxoInSharedUtxosSpend']);
        }

        if (!isInteger(args.expiry) || args.expiry < 1) {
          return cbk([400, 'ExpectedExpiryForSharedUtxosSpend']);
        }

        if (!isFeeRate(args.fee_tokens_per_vbyte)) {
          return cbk([400, 'ExpectedFeeRateForSharedUtxosSpend']);
        }

        if (!isInteger(args.key_family)) {
          return cbk([400, 'ExpectedKeyFamilyForSharedUtxosSpend']);
        }

        if (!isInteger(args.key_index)) {
          return cbk([400, 'ExpectedKeyIndexForSharedUtxosSpend']);
        }

        if (!args.lnd) {
          return cbk([400, 'ExpectedAuthenticatedLndForSharedUtxosSpend']);
        }

        if (!args.metadata) {
          return cbk([400, 'ExpectedAuthMetadataForSharedUtxosSpend']);
        }

        if (!args.network || !names[args.network]) {
          return cbk([400, 'ExpectedKnownNetworkForSharedUtxosSpend']);
        }

        if (!args.service || !args.service.serverPsbtWithdrawDeposits) {
          return cbk([400, 'ExpectedServiceForSharedUtxosSpend']);
        }

        if (!args.service_public_key) {
          return cbk([400, 'ExpectedServiceKeyForSharedUtxosSpend']);
        }

        if (!args.sweep_address) {
          return cbk([400, 'ExpectedSweepAddressForSharedUtxosSpend']);
        }

        const isTokens = n => isSafeInteger(n) && n > 0;

        if (args.tokens !== undefined && !isTokens(args.tokens)) {
          return cbk([400, 'ExpectedValidTokensForSharedUtxosSpend']);
        }

        return cbk();
      },

      // Get the shared address client public key
      getKey: ['validate', ({}, cbk) => {
        return getPublicKey({
          family: args.key_family,
          index: args.key_index,
          lnd: args.lnd,
        },
        cbk);
      }],

      // Get the output script that the utxos are spent to
      sweepScript: ['validate', asyncify(({}) => {
        try {
          const {script} = outputScriptForAddress({
            address: args.sweep_address,
            network: args.network,
          });

          return script;
        } catch (err) {
          throw [400, 'ExpectedValidSweepAddressForSharedUtxosSpend'];
        }
      })],

      // Derive the shared address that the utxos were sent to
      address: ['getKey', asyncify(({getKey}) => {
        try {
          const address = sharedAddressScript({
            client_public_key: getKey.public_key,
            expiry: args.expiry,
            network: args.network,
            server_public_key: args.service_public_key,
          });

          return {
            output_script: address.output_script,
            root_hash: address.root_hash,
          };
        } catch (err) {
          throw [400, 'FailedToDeriveSharedAddressToSpend', {err}];
        }
      })],

      // Make the unsigned spend transaction
      unsigned: ['address', 'sweepScript', ({address, sweepScript}, cbk) => {
        const total = sumOf(args.utxos);

        // Utxos are spent in the order they are given
        const inputs = args.utxos.map(utxo => ({
          sequence,
          id: utxo.transaction_id,
          script: emptyScript,
          vout: utxo.transaction_vout,
        }));

        // Key spend witnesses have a fixed size, so the fee is exact
        const placeholders = inputs.map(input => ({
          ...input,
          witness: [placeholderSignature],
        }));

        const feeFor = outputs => {
          const transaction = asTx({
            outputs,
            inputs: placeholders,
            locktime: lockTime,
            version: txVersion,
          });

          const {vsize} = sizeOfTransaction({transaction});

          return ceil(args.fee_tokens_per_vbyte * vsize);
        };

        const changeOutput = {script: address.output_script, tokens: total};
        const sweepOutput = {script: sweepScript, tokens: total};

        const fee = feeFor([sweepOutput]);

        const amounts = spendAmounts({
          fee,
          fee_with_change: feeFor([sweepOutput, changeOutput]),
          tokens: args.tokens,
          total,
        });

        if (amounts.spend === undefined) {
          return cbk([400, 'ExpectedMoreUtxosToPayForSharedUtxosSpend']);
        }

        if (amounts.spend <= dustTokens) {
          return cbk([400, 'ExpectedMoreTokensToSpendSharedUtxos', {fee}]);
        }

        // A utxo is not needed when it is not more than the change
        if (args.utxos.some(({tokens}) => amounts.change >= tokens)) {
          return cbk([400, 'UnexpectedUnneededUtxoInSharedUtxosSpend']);
        }

        const outputs = [{script: sweepScript, tokens: amounts.spend}];

        // Change goes back to the shared address
        if (!!amounts.change) {
          outputs.push({
            script: address.output_script,
            tokens: amounts.change,
          });
        }

        const transaction = asTx({
          inputs,
          outputs,
          locktime: lockTime,
          version: txVersion,
        });

        const spends = args.utxos.map(utxo => ({
          script: address.output_script,
          tokens: utxo.tokens,
        }));

        const unsignedPsbt = createPsbt({
          outputs,
          utxos: inputs.map(({id, vout}) => ({id, sequence, vout})),
          version: txVersion,
        });

        // The PSBT has the utxo outputs for the swap service to check
        const {psbt} = extendPsbt({
          inputs: spends.map(({script, tokens}) => ({
            witness_utxo: {tokens, script_pub: script},
          })),
          psbt: unsignedPsbt.psbt,
        });

        return cbk(null, {
          inputs,
          outputs,
          psbt,
          spends,
          transaction,
          id: idForTransaction({transaction}).id,
        });
      }],

      // Get the hash that the signature of each spent utxo commits to
      hashes: ['unsigned', ({unsigned}, cbk) => {
        const hashes = unsigned.inputs.map((input, vin) => {
          const {hash} = v1HashToSign({
            vin,
            sighash: sighashDefault,
            spends: unsigned.spends,
            transaction: unsigned.transaction,
          });

          return hash;
        });

        return cbk(null, hashes);
      }],

      // Start a MuSig2 signing session for every utxo
      sessions: ['address', 'unsigned', ({address}, cbk) => {
        // Started sessions are tracked so that they can be ended on failure
        const sessions = [];

        return asyncEachSeries(args.utxos, ({}, cbk) => {
          return beginSession({
            sessions,
            key_family: args.key_family,
            key_index: args.key_index,
            lnd: args.lnd,
            output_script: address.output_script,
            root_hash: address.root_hash,
            service_public_key: args.service_public_key,
          },
          cbk);
        },
        err => {
          // Started sessions are ended when a session cannot be started
          if (!!err) {
            return endSessions({sessions, lnd: args.lnd}, () => cbk(err));
          }

          return cbk(null, sessions);
        });
      }],

      // Ask the swap service to sign the spend
      request: ['sessions', 'unsigned', ({sessions, unsigned}, cbk) => {
        // The open signing sessions are ended when the request fails
        const fail = (...error) => {
          return endSessions({sessions, lnd: args.lnd}, () => cbk(error));
        };

        // Utxos are keyed by outpoint with a lowercase tx id
        const utxoKeys = args.utxos.map(n => outpoint(n).toLowerCase());

        const nonces = utxoKeys.reduce((sum, key, i) => {
          sum[key] = hexAsBuffer(sessions[i].nonce);

          return sum;
        },
        {});

        return args.service.serverPsbtWithdrawDeposits({
          deposit_to_nonces: nonces,
          withdrawal_psbt: hexAsBuffer(unsigned.psbt),
        },
        args.metadata,
        (err, res) => {
          if (!!err) {
            return fail(503, 'UnexpectedErrorSpendingSharedUtxos', {err});
          }

          if (!res || !isBuffer(res.txid) || !res.signing_info) {
            return fail(503, 'ExpectedResponseToSharedUtxosSpendRequest');
          }

          // The service signs the transaction of the PSBT
          if (!res.txid.equals(reversed(hexAsBuffer(unsigned.id)))) {
            return fail(503, 'UnexpectedTxIdInSharedUtxosSpendResponse');
          }

          const signed = keys(res.signing_info);

          // The service signs for every utxo and only for the utxos
          if (signed.length !== args.utxos.length) {
            return fail(503, 'ExpectedSigningInfoForEverySpentUtxo');
          }

          const signingInfo = utxoKeys.map(key => res.signing_info[key]);

          if (signingInfo.some(info => !info)) {
            return fail(503, 'ExpectedSigningInfoForEverySpentUtxo');
          }

          const isValid = ({nonce, sig}) => isNonce(nonce) && isSig(sig);

          if (!signingInfo.every(isValid)) {
            return fail(503, 'ExpectedValidSigningInfoForSpentUtxo');
          }

          return cbk(null, signingInfo.map(info => ({
            nonce: bufferAsHex(info.nonce),
            signature: bufferAsHex(info.sig),
          })));
        });
      }],

      // Sign the utxos and combine the signatures with the swap service
      sign: [
        'hashes',
        'request',
        'sessions',
        ({hashes, request, sessions}, cbk) =>
      {
        return asyncMapSeries(sessions, (session, cbk) => {
          const vin = sessions.indexOf(session);

          // The session is marked as ended once the signatures are combined
          return finishSession({
            session,
            hash: hashes[vin],
            lnd: args.lnd,
            nonce: request[vin].nonce,
            signature: request[vin].signature,
          },
          cbk);
        },
        (err, res) => {
          // The sessions that are not ended yet are ended on a failure
          if (!!err) {
            return endSessions({sessions, lnd: args.lnd}, () => cbk(err));
          }

          return cbk(null, res);
        });
      }],

      // Add the signatures to the spend transaction
      spend: ['sign', 'unsigned', ({sign, unsigned}, cbk) => {
        const {transaction} = encodeTransaction({
          inputs: unsigned.inputs.map((input, vin) => ({
            ...input,
            witness: [sign[vin].signature],
          })),
          locktime: lockTime,
          outputs: unsigned.outputs,
          version: txVersion,
        });

        return cbk(null, {transaction, id: unsigned.id});
      }],
    },
    returnResult({reject, resolve, of: 'spend'}, cbk));
  });
};

const asyncAuto = require('async/auto');
const asyncify = require('async/asyncify');
const {controlBlock} = require('p2tr');
const {getPublicKey} = require('ln-service');
const {idForTransaction} = require('@alexbosworth/blockchain');
const {outputScriptForAddress} = require('@alexbosworth/blockchain');
const {returnResult} = require('asyncjs-util');
const {signTransaction} = require('ln-service');
const {sizeOfTransaction} = require('@alexbosworth/blockchain');
const {v1HashToSign} = require('p2tr');

const {encodeTransaction} = require('./../transactions');
const isValidRefundSignature = require('./is_valid_refund_signature');
const {names} = require('./../conf/networks');
const {sharedAddressScript} = require('./../script');

const asTx = components => encodeTransaction(components).transaction;
const {ceil} = Math;
const dustTokens = 546;
const emptyScript = '';
const {isArray} = Array;
const isFeeRate = n => Number.isFinite(n) && n > 0;
const isHash = n => !!n && /^[0-9A-F]{64}$/i.test(n);
const {isInteger} = Number;
const {isSafeInteger} = Number;
const lockTime = 0;
const maxTokens = 21e14;
const maxVout = 4294967295;
const outpoint = n => `${n.transaction_id}:${n.transaction_vout}`;
const placeholderSignature = Buffer.alloc(64).toString('hex');
const sighashDefault = 0;
const sumOf = utxos => utxos.reduce((sum, n) => sum + n.tokens, 0);
const txVersion = 2;
const xOnlyKey = key => key.slice(2);

/** Sign a refund of expired shared address utxos

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
    network: <Network Name String>
    service_public_key: <Shared Address Service Public Key Hex String>
    sweep_address: <Sweep Tokens to Address String>
  }

  @returns via cbk or Promise
  {
    id: <Refund Transaction Id Hex String>
    transaction: <Signed Refund Transaction Hex String>
  }
*/
module.exports = (args, cbk) => {
  return new Promise((resolve, reject) => {
    return asyncAuto({
      // Check arguments
      validate: cbk => {
        if (!isArray(args.utxos) || !args.utxos.length) {
          return cbk([400, 'ExpectedUtxosForSharedUtxosRefund']);
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
          return cbk([400, 'ExpectedValidUtxosForSharedUtxosRefund']);
        }

        if (sumOf(args.utxos) > maxTokens) {
          return cbk([400, 'ExpectedValidUtxosForSharedUtxosRefund']);
        }

        const outpoints = args.utxos.map(n => outpoint(n).toLowerCase());

        if (new Set(outpoints).size !== outpoints.length) {
          return cbk([400, 'UnexpectedDuplicateSharedUtxoToRefund']);
        }

        if (!isInteger(args.expiry) || args.expiry < 1) {
          return cbk([400, 'ExpectedExpiryForSharedUtxosRefund']);
        }

        if (!isFeeRate(args.fee_tokens_per_vbyte)) {
          return cbk([400, 'ExpectedFeeRateForSharedUtxosRefund']);
        }

        if (!isInteger(args.key_family)) {
          return cbk([400, 'ExpectedKeyFamilyForSharedUtxosRefund']);
        }

        if (!isInteger(args.key_index)) {
          return cbk([400, 'ExpectedKeyIndexForSharedUtxosRefund']);
        }

        if (!args.lnd) {
          return cbk([400, 'ExpectedAuthenticatedLndForSharedUtxosRefund']);
        }

        if (!args.network || !names[args.network]) {
          return cbk([400, 'ExpectedKnownNetworkForSharedUtxosRefund']);
        }

        if (!args.service_public_key) {
          return cbk([400, 'ExpectedServiceKeyForSharedUtxosRefund']);
        }

        if (!args.sweep_address) {
          return cbk([400, 'ExpectedSweepAddressForSharedUtxosRefund']);
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

      // Get the output script that the utxos are refunded to
      sweepScript: ['validate', asyncify(({}) => {
        try {
          const {script} = outputScriptForAddress({
            address: args.sweep_address,
            network: args.network,
          });

          return script;
        } catch (err) {
          throw [400, 'ExpectedValidSweepAddressForSharedUtxosRefund'];
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

          // The control block proves the timeout path is in the address
          const {block} = controlBlock({
            external_key: address.external_key,
            internal_key: address.internal_key,
            leaf_script: address.timeout_script,
            script_branches: address.script_branches,
          });

          return {
            block,
            output_script: address.output_script,
            signing_key: xOnlyKey(getKey.public_key),
            timeout_script: address.timeout_script,
          };
        } catch (err) {
          throw [400, 'FailedToDeriveSharedAddressToRefund', {err}];
        }
      })],

      // Make the unsigned refund transaction
      unsigned: ['address', 'sweepScript', ({address, sweepScript}, cbk) => {
        const total = sumOf(args.utxos);

        // Utxos are spent through the timeout path after the expiry
        const inputs = args.utxos.map(utxo => ({
          id: utxo.transaction_id,
          script: emptyScript,
          sequence: args.expiry,
          vout: utxo.transaction_vout,
        }));

        // Every timeout path witness has the same size so the fee is exact
        const witness = [address.timeout_script, address.block];

        const dummyWitness = [placeholderSignature].concat(witness);

        const {vsize} = sizeOfTransaction({
          transaction: asTx({
            inputs: inputs.map(input => ({...input, witness: dummyWitness})),
            locktime: lockTime,
            outputs: [{script: sweepScript, tokens: total}],
            version: txVersion,
          }),
        });

        const fee = ceil(args.fee_tokens_per_vbyte * vsize);

        if (total - fee <= dustTokens) {
          return cbk([400, 'ExpectedMoreTokensForSharedUtxosRefund', {fee}]);
        }

        const outputs = [{script: sweepScript, tokens: total - fee}];

        return cbk(null, {
          inputs,
          outputs,
          witness,
          spends: args.utxos.map(utxo => ({
            script: address.output_script,
            tokens: utxo.tokens,
          })),
          transaction: asTx({
            inputs,
            outputs,
            locktime: lockTime,
            version: txVersion,
          }),
        });
      }],

      // Sign the utxo spends with the shared address client key
      sign: ['address', 'unsigned', ({address, unsigned}, cbk) => {
        return signTransaction({
          inputs: args.utxos.map((utxo, vin) => ({
            vin,
            key_family: args.key_family,
            key_index: args.key_index,
            output_script: address.output_script,
            output_tokens: utxo.tokens,
            sighash: sighashDefault,
            witness_script: address.timeout_script,
          })),
          lnd: args.lnd,
          transaction: unsigned.transaction,
        },
        cbk);
      }],

      // Get the hashes that the utxo spend signatures commit to
      hashes: ['address', 'unsigned', ({address, unsigned}, cbk) => {
        const hashes = unsigned.inputs.map((input, vin) => {
          const {hash} = v1HashToSign({
            vin,
            leaf: {script: address.timeout_script},
            sighash: sighashDefault,
            spends: unsigned.spends,
            transaction: unsigned.transaction,
          });

          return hash;
        });

        return cbk(null, hashes);
      }],

      // Make sure that the signatures can spend the timeout path
      signatures: [
        'address',
        'hashes',
        'sign',
        ({address, hashes, sign}, cbk) =>
      {
        const {signatures} = sign;

        if (signatures.length !== args.utxos.length) {
          return cbk([503, 'ExpectedSignatureForEveryUtxoToRefund']);
        }

        const isValid = (signature, vin) => isValidRefundSignature({
          signature,
          hash: hashes[vin],
          key: address.signing_key,
        });

        if (!signatures.every(isValid)) {
          return cbk([503, 'ExpectedValidSignatureForSharedUtxoRefund']);
        }

        return cbk(null, signatures);
      }],

      // Add the timeout path witnesses to the refund transaction
      refund: ['signatures', 'unsigned', ({signatures, unsigned}, cbk) => {
        const {transaction} = encodeTransaction({
          inputs: unsigned.inputs.map((input, vin) => ({
            ...input,
            witness: [signatures[vin]].concat(unsigned.witness),
          })),
          locktime: lockTime,
          outputs: unsigned.outputs,
          version: txVersion,
        });

        return cbk(null, {
          transaction,
          id: idForTransaction({transaction}).id,
        });
      }],
    },
    returnResult({reject, resolve, of: 'refund'}, cbk));
  });
};

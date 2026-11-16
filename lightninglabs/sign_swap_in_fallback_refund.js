const asyncAuto = require('async/auto');
const asyncify = require('async/asyncify');
const bip65Encode = require('bip65').encode;
const {getPublicKey} = require('ln-service');
const {idForTransaction} = require('@alexbosworth/blockchain');
const {outputScriptForAddress} = require('@alexbosworth/blockchain');
const {returnResult} = require('asyncjs-util');
const {signTransaction} = require('ln-service');
const {sizeOfTransaction} = require('@alexbosworth/blockchain');

const {encodeTransaction} = require('./../transactions');
const {names} = require('./../conf/networks');
const {p2wshOutputScript} = require('./../script');
const swapInFallbackScript = require('./swap_in_fallback_script');

const asTx = components => encodeTransaction(components).transaction;
const {ceil} = Math;
const dustTokens = 546;
const emptyScript = '';
const {isArray} = Array;
const isFeeRate = n => Number.isFinite(n) && n > 0;
const isHash = n => !!n && /^[0-9A-F]{64}$/i.test(n);
const {isInteger} = Number;
const isPublicKey = n => !!n && /^0[2-3][0-9A-F]{64}$/i.test(n);
const {isSafeInteger} = Number;
const maxLocktimeHeight = 499999999;
const maxTokens = 21e14;
const maxVout = 4294967295;
const nonFinalSequence = 0;
const outpoint = n => `${n.transaction_id}:${n.transaction_vout}`;
const placeholderSignature = Buffer.alloc(73).toString('hex');
const refundPathElement = '';
const sighashAll = 1;
const sighashAllFlag = '01';
const sumOf = utxos => utxos.reduce((sum, n) => sum + n.tokens, 0);
const txVersion = 2;

/** Sign a refund of the fallback HTLC of a swap in after the HTLC times out

  {
    utxos: [{
      tokens: <Utxo Tokens Number>
      transaction_id: <Utxo Transaction Id Hex String>
      transaction_vout: <Utxo Transaction Output Index Number>
    }]
    [block_height]: <Timelock Block Height At or After Timeout Number>
    fee_tokens_per_vbyte: <Fee Tokens Per Virtual Byte Number>
    hash: <Swap Hash Hex String>
    key_family: <HTLC Refund Key Family Number>
    key_index: <HTLC Refund Key Index Number>
    lnd: <Authenticated LND API Object>
    network: <Network Name String>
    service_public_key: <Service HTLC Public Key Hex String>
    sweep_address: <Sweep Tokens to Address String>
    timeout: <Swap HTLC Timeout Height Number>
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
          return cbk([400, 'ExpectedUtxosForSwapInFallbackRefund']);
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
          return cbk([400, 'ExpectedValidUtxosForSwapInFallbackRefund']);
        }

        if (sumOf(args.utxos) > maxTokens) {
          return cbk([400, 'ExpectedValidUtxosForSwapInFallbackRefund']);
        }

        const outpoints = args.utxos.map(n => outpoint(n).toLowerCase());

        if (new Set(outpoints).size !== outpoints.length) {
          return cbk([400, 'UnexpectedDuplicateUtxoForSwapInFallbackRefund']);
        }

        if (!isFeeRate(args.fee_tokens_per_vbyte)) {
          return cbk([400, 'ExpectedFeeRateForSwapInFallbackRefund']);
        }

        if (!isHash(args.hash)) {
          return cbk([400, 'ExpectedSwapHashForSwapInFallbackRefund']);
        }

        if (!isInteger(args.key_family)) {
          return cbk([400, 'ExpectedKeyFamilyForSwapInFallbackRefund']);
        }

        if (!isInteger(args.key_index)) {
          return cbk([400, 'ExpectedKeyIndexForSwapInFallbackRefund']);
        }

        if (!args.lnd) {
          return cbk([400, 'ExpectedAuthenticatedLndForSwapInFallbackRefund']);
        }

        if (!args.network || !names[args.network]) {
          return cbk([400, 'ExpectedKnownNetworkForSwapInFallbackRefund']);
        }

        if (!isPublicKey(args.service_public_key)) {
          return cbk([400, 'ExpectedServiceKeyForSwapInFallbackRefund']);
        }

        if (!args.sweep_address) {
          return cbk([400, 'ExpectedSweepAddressForSwapInFallbackRefund']);
        }

        if (!isInteger(args.timeout) || args.timeout < 1) {
          return cbk([400, 'ExpectedTimeoutHeightForSwapInFallbackRefund']);
        }

        if (args.timeout > maxLocktimeHeight) {
          return cbk([400, 'ExpectedTimeoutHeightForSwapInFallbackRefund']);
        }

        // Exit early when the refund is timelocked to the HTLC timeout
        if (args.block_height === undefined) {
          return cbk();
        }

        if (!isInteger(args.block_height)) {
          return cbk([400, 'ExpectedTimelockHeightForSwapInFallbackRefund']);
        }

        // The HTLC timeout path cannot be spent before the timeout
        if (args.block_height < args.timeout) {
          return cbk([400, 'ExpectedLaterTimelockForSwapInFallbackRefund']);
        }

        if (args.block_height > maxLocktimeHeight) {
          return cbk([400, 'ExpectedTimelockHeightForSwapInFallbackRefund']);
        }

        return cbk();
      },

      // Get the HTLC refund public key
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
          throw [400, 'ExpectedValidSweepAddressForSwapInFallbackRefund'];
        }
      })],

      // Derive the fallback HTLC that the utxos were sent to
      htlc: ['getKey', ({getKey}, cbk) => {
        const fallback = swapInFallbackScript({
          claim_public_key: args.service_public_key,
          hash: args.hash,
          network: args.network,
          refund_public_key: getKey.public_key,
          timeout: args.timeout,
        });

        if (!!fallback.err) {
          const {err} = fallback;

          return cbk([400, 'FailedToDeriveSwapInFallbackToRefund', {err}]);
        }

        return cbk(null, {
          output_script: p2wshOutputScript({script: fallback.script}).output,
          public_key: getKey.public_key,
          script: fallback.script,
        });
      }],

      // Make the unsigned refund transaction
      unsigned: ['htlc', 'sweepScript', ({htlc, sweepScript}, cbk) => {
        // A later timelock height holds the refund back until a later block
        const height = args.block_height || args.timeout;

        const locktime = bip65Encode({blocks: height});
        const total = sumOf(args.utxos);

        // OP_CLTV needs the locktime set and prohibits a final sequence
        const inputs = args.utxos.map(utxo => ({
          id: utxo.transaction_id,
          script: emptyScript,
          sequence: nonFinalSequence,
          vout: utxo.transaction_vout,
        }));

        // The empty element takes the refund path instead of the claim path
        const witness = [htlc.public_key, refundPathElement, htlc.script];

        // A placeholder signature of the largest size makes the fee enough
        const dummyWitness = [placeholderSignature].concat(witness);

        const {vsize} = sizeOfTransaction({
          transaction: asTx({
            locktime,
            inputs: inputs.map(input => ({...input, witness: dummyWitness})),
            outputs: [{script: sweepScript, tokens: total}],
            version: txVersion,
          }),
        });

        const fee = ceil(args.fee_tokens_per_vbyte * vsize);

        if (total - fee <= dustTokens) {
          return cbk([400, 'ExpectedMoreTokensToRefundSwapInFallback', {fee}]);
        }

        const outputs = [{script: sweepScript, tokens: total - fee}];

        return cbk(null, {
          inputs,
          locktime,
          outputs,
          witness,
          transaction: asTx({inputs, locktime, outputs, version: txVersion}),
        });
      }],

      // Sign the utxo spends with the HTLC refund key
      sign: ['htlc', 'unsigned', ({htlc, unsigned}, cbk) => {
        return signTransaction({
          inputs: args.utxos.map((utxo, vin) => ({
            vin,
            key_family: args.key_family,
            key_index: args.key_index,
            output_script: htlc.output_script,
            output_tokens: utxo.tokens,
            sighash: sighashAll,
            witness_script: htlc.script,
          })),
          lnd: args.lnd,
          transaction: unsigned.transaction,
        },
        cbk);
      }],

      // Add the refund path witnesses to the refund transaction
      refund: ['sign', 'unsigned', ({sign, unsigned}, cbk) => {
        if (sign.signatures.length !== args.utxos.length) {
          return cbk([503, 'ExpectedSignatureForEveryFallbackUtxoToRefund']);
        }

        // LND signatures leave off the sighash flag that they commit to
        const signatures = sign.signatures.map(n => n + sighashAllFlag);

        const {transaction} = encodeTransaction({
          inputs: unsigned.inputs.map((input, vin) => ({
            ...input,
            witness: [signatures[vin]].concat(unsigned.witness),
          })),
          locktime: unsigned.locktime,
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

const asyncAuto = require('async/auto');
const asyncify = require('async/asyncify');
const asyncMapLimit = require('async/mapLimit');
const {getPublicKey} = require('ln-service');
const {returnResult} = require('asyncjs-util');

const partialSignSharedAddress = require('./partial_sign_shared_address');
const {sharedAddressScript} = require('./../script');
const {swapInFallbacks} = require('./conf/swap_service');
const {swapInServiceFallbackTx} = require('./../taproot');

const flatten = arr => [].concat(...arr);
const hexAsBuffer = hex => Buffer.from(hex, 'hex');
const {isArray} = Array;
const isHash = n => !!n && /^[0-9A-F]{64}$/i.test(n);
const isHex = n => !!n && !(n.length % 2) && /^[0-9A-F]*$/i.test(n);
const {isInteger} = Number;
const isNonce = n => !!n && /^[0-9A-F]{132}$/i.test(n);
const {isSafeInteger} = Number;
const signInputsLimit = 8;

/** Sign the service fallback transactions of a swap in

  Once signed the service can publish a fallback HTLC, watch it until paid

  {
    utxos: [{
      tokens: <Utxo Tokens Number>
      transaction_id: <Utxo Transaction Id Hex String>
      transaction_vout: <Utxo Transaction Output Index Number>
    }]
    expiry: <Shared Address Expiry Blocks Count Number>
    fallbacks: [{
      fee_tokens_per_kw: <Fee Tokens Per Thousand Weight Units Number>
      nonces: [<Service MuSig2 Public Nonce For Utxo Hex String>]
      type: <Fallback Fee Rate Type String>
    }]
    id: <Swap Hash Hex String>
    key_family: <Shared Address Client Key Family Number>
    key_index: <Shared Address Client Key Index Number>
    lnd: <Authenticated LND API Object>
    metadata: <Authentication Metadata Object>
    network: <Network Name String>
    script: <Swap HTLC Witness Script Hex String>
    service: <Swap Service Object>
    service_public_key: <Shared Address Service Public Key Hex String>
    tokens: <Swap Tokens Number>
  }

  @returns via cbk or Promise
  {
    transactions: [{
      id: <HTLC Transaction Id Hex String>
      transaction: <Unsigned HTLC Transaction Hex String>
      type: <Fallback Fee Rate Type String>
    }]
  }
*/
module.exports = (args, cbk) => {
  return new Promise((resolve, reject) => {
    return asyncAuto({
      // Check arguments
      validate: cbk => {
        if (!isArray(args.utxos) || !args.utxos.length) {
          return cbk([400, 'ExpectedUtxosToSignServiceFallback']);
        }

        if (!isInteger(args.expiry)) {
          return cbk([400, 'ExpectedAddressExpiryToSignServiceFallback']);
        }

        if (!isArray(args.fallbacks) || args.fallbacks.some(n => !n)) {
          return cbk([400, 'ExpectedFallbacksToSignServiceFallback']);
        }

        const types = args.fallbacks.map(n => n.type);

        // Signatures are expected for every type of HTLC
        if (types.length !== swapInFallbacks.length) {
          return cbk([400, 'ExpectedEveryFallbackTypeToSignServiceFallback']);
        }

        if (swapInFallbacks.some(({type}) => !types.includes(type))) {
          return cbk([400, 'ExpectedEveryFallbackTypeToSignServiceFallback']);
        }

        const rates = args.fallbacks.map(n => n.fee_tokens_per_kw);

        if (rates.some(rate => !isSafeInteger(rate) || rate < 0)) {
          return cbk([400, 'ExpectedFallbackFeeRatesToSignServiceFallback']);
        }

        const nonces = args.fallbacks.map(n => n.nonces);

        const isNonces = n => isArray(n) && n.every(nonce => isNonce(nonce));

        if (nonces.some(list => !isNonces(list))) {
          return cbk([400, 'ExpectedFallbackNoncesToSignServiceFallback']);
        }

        if (nonces.some(list => list.length !== args.utxos.length)) {
          return cbk([400, 'ExpectedNonceForEveryUtxoToSignServiceFallback']);
        }

        if (!isHash(args.id)) {
          return cbk([400, 'ExpectedSwapHashToSignServiceFallback']);
        }

        if (!isInteger(args.key_family)) {
          return cbk([400, 'ExpectedKeyFamilyToSignServiceFallback']);
        }

        if (!isInteger(args.key_index)) {
          return cbk([400, 'ExpectedKeyIndexToSignServiceFallback']);
        }

        if (!args.lnd) {
          return cbk([400, 'ExpectedAuthenticatedLndToSignServiceFallback']);
        }

        if (!args.metadata) {
          return cbk([400, 'ExpectedAuthMetadataToSignServiceFallback']);
        }

        if (!args.network) {
          return cbk([400, 'ExpectedNetworkNameToSignServiceFallback']);
        }

        if (!isHex(args.script)) {
          return cbk([400, 'ExpectedHtlcScriptToSignServiceFallback']);
        }

        if (!args.service || !args.service.pushStaticAddressHtlcSigs) {
          return cbk([400, 'ExpectedServiceToSignServiceFallback']);
        }

        if (!args.service_public_key) {
          return cbk([400, 'ExpectedServiceKeyToSignServiceFallback']);
        }

        if (!isSafeInteger(args.tokens) || args.tokens < 1) {
          return cbk([400, 'ExpectedSwapTokensToSignServiceFallback']);
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
          throw [400, 'FailedToDeriveSharedAddressToSignFallback', {err}];
        }
      })],

      // Build the unsigned HTLC transactions for every fee rate
      unsigned: ['address', asyncify(({address}) => {
        // Make the unsigned HTLC transaction for an HTLC fee rate
        const makeTx = fallback => swapInServiceFallbackTx({
          utxos: args.utxos,
          fee_tokens_per_kw: fallback.fee_tokens_per_kw,
          output_script: address.output_script,
          script: args.script,
          tokens: args.tokens,
        });

        try {
          return args.fallbacks.map(fallback => makeTx(fallback));
        } catch (err) {
          throw [400, 'FailedToBuildServiceFallbackTx', {err}];
        }
      })],

      // Pair every utxo input with the service nonce for that utxo
      inputs: ['unsigned', ({unsigned}, cbk) => {
        const hashes = flatten(unsigned.map(tx => tx.hashes));
        const nonces = flatten(args.fallbacks.map(n => n.nonces));

        return cbk(null, hashes.map((hash, i) => ({hash, nonce: nonces[i]})));
      }],

      // Partially sign the utxo inputs of every HTLC transaction
      sign: ['address', 'inputs', ({address, inputs}, cbk) => {
        // Inputs are signed in parallel to push the signatures in time
        return asyncMapLimit(inputs, signInputsLimit, ({hash, nonce}, cbk) => {
          return partialSignSharedAddress({
            hash,
            nonce,
            key_family: args.key_family,
            key_index: args.key_index,
            lnd: args.lnd,
            output_script: address.output_script,
            root_hash: address.root_hash,
            service_public_key: args.service_public_key,
          },
          cbk);
        },
        cbk);
      }],

      // Group the signatures by the fee rate type of the HTLC
      request: ['sign', ({sign}, cbk) => {
        const request = {swap_hash: hexAsBuffer(args.id)};
        const utxosCount = args.utxos.length;

        args.fallbacks.forEach((fallback, i) => {
          const {info} = swapInFallbacks.find(n => n.type === fallback.type);
          const signatures = sign.slice(i * utxosCount, (i + 1) * utxosCount);

          return request[info] = {
            nonces: signatures.map(sig => hexAsBuffer(sig.nonce)),
            sigs: signatures.map(sig => hexAsBuffer(sig.signature)),
          };
        });

        return cbk(null, request);
      }],

      // Push the signatures to the swap service
      push: ['request', ({request}, cbk) => {
        // A failure to push the signatures is passed back
        const pushed = err => {
          if (!!err) {
            return cbk([503, 'UnexpectedErrorPushingFallbackSigs', {err}]);
          }

          return cbk();
        };

        return args.service.pushStaticAddressHtlcSigs(
          request,
          args.metadata,
          pushed
        );
      }],

      // The HTLC transactions that the swap service can publish
      transactions: ['push', 'unsigned', ({unsigned}, cbk) => {
        return cbk(null, {
          transactions: unsigned.map((tx, i) => ({
            id: tx.id,
            transaction: tx.transaction,
            type: args.fallbacks[i].type,
          })),
        });
      }],
    },
    returnResult({reject, resolve, of: 'transactions'}, cbk));
  });
};

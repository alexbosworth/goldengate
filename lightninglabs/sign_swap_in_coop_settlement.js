const asyncAuto = require('async/auto');
const asyncify = require('async/asyncify');
const asyncMapSeries = require('async/mapSeries');
const {componentsOfTransaction} = require('@alexbosworth/blockchain');
const {decodePsbt} = require('psbt');
const {getInvoice} = require('ln-service');
const {getPublicKey} = require('ln-service');
const {idForTransaction} = require('@alexbosworth/blockchain');
const {returnResult} = require('asyncjs-util');
const {v1HashToSign} = require('p2tr');

const partialSignSharedAddress = require('./partial_sign_shared_address');
const {sharedAddressScript} = require('./../script');

const asOutpoint = n => ({transaction_id: n.id, transaction_vout: n.vout});
const flatten = arr => [].concat(...arr);
const hexAsBuffer = hex => Buffer.from(hex, 'hex');
const {isArray} = Array;
const isHash = n => !!n && /^[0-9A-F]{64}$/i.test(n);
const isHex = n => !!n && !(n.length % 2) && /^[0-9A-F]*$/i.test(n);
const {isInteger} = Number;
const isNonce = n => !!n && /^[0-9A-F]{132}$/i.test(n);
const {isSafeInteger} = Number;
const isSameHash = (a, b) => a.toLowerCase() === b.toLowerCase();
const outpoint = n => `${n.transaction_id}:${n.transaction_vout}`;
const reversed = buffer => Buffer.from(buffer).reverse();
const sighashDefault = 0;
const sumOf = utxos => utxos.reduce((sum, n) => sum + n.tokens, 0);

/** Cosign the cooperative settlement of a swap in

  Pass every unsettled swap, a settlement can batch the utxos of many swaps

  The swap payment request has to be paid to `lnd` before it can be cosigned,
  defer cosigning an unpaid swap with `deferSwapInCoopSettlement`

  {
    expiry: <Shared Address Expiry Blocks Count Number>
    id: <Swap Hash Hex String>
    key_family: <Shared Address Client Key Family Number>
    key_index: <Shared Address Client Key Index Number>
    lnd: <Authenticated LND API Object>
    metadata: <Authentication Metadata Object>
    network: <Network Name String>
    nonces: [{
      nonce: <Service MuSig2 Public Nonce Hex String>
      transaction_id: <Utxo Transaction Id Hex String>
      transaction_vout: <Utxo Transaction Output Index Number>
    }]
    prevouts: [{
      script: <Spending Output Script Hex String>
      tokens: <Spending Output Tokens Number>
      transaction_id: <Spending Transaction Id Hex String>
      transaction_vout: <Spending Transaction Output Index Number>
    }]
    psbt: <Settlement Transaction PSBT Hex String>
    service: <Swap Service Object>
    service_public_key: <Shared Address Service Public Key Hex String>
    swaps: [{
      utxos: [{
        tokens: <Utxo Tokens Number>
        transaction_id: <Utxo Transaction Id Hex String>
        transaction_vout: <Utxo Transaction Output Index Number>
      }]
      id: <Swap Hash Hex String>
      tokens: <Swap Tokens Number>
    }]
  }

  @returns via cbk or Promise
  {
    transaction_id: <Settlement Transaction Id Hex String>
  }
*/
module.exports = (args, cbk) => {
  return new Promise((resolve, reject) => {
    return asyncAuto({
      // Check arguments
      validate: cbk => {
        if (!isInteger(args.expiry)) {
          return cbk([400, 'ExpectedSharedAddressExpiryToSignSettlement']);
        }

        if (!isHash(args.id)) {
          return cbk([400, 'ExpectedSwapHashToSignSettlement']);
        }

        if (!isInteger(args.key_family)) {
          return cbk([400, 'ExpectedKeyFamilyToSignSettlement']);
        }

        if (!isInteger(args.key_index)) {
          return cbk([400, 'ExpectedKeyIndexToSignSettlement']);
        }

        if (!args.lnd) {
          return cbk([400, 'ExpectedAuthenticatedLndToSignSettlement']);
        }

        if (!args.metadata) {
          return cbk([400, 'ExpectedAuthMetadataToSignSettlement']);
        }

        if (!args.network) {
          return cbk([400, 'ExpectedNetworkNameToSignSettlement']);
        }

        // An outpoint has a transaction id and an output index
        const isOutpoint = output => {
          if (!output || !isHash(output.transaction_id)) {
            return false;
          }

          const vout = output.transaction_vout;

          return isInteger(vout) && vout >= 0;
        };

        if (!isArray(args.nonces) || !args.nonces.length) {
          return cbk([400, 'ExpectedServiceNoncesToSignSettlement']);
        }

        const isNonceInfo = n => isOutpoint(n) && isNonce(n.nonce);

        if (!args.nonces.every(isNonceInfo)) {
          return cbk([400, 'ExpectedValidNoncesToSignSettlement']);
        }

        // A prevout is an outpoint with an output script and a value
        const isPrevout = prevout => {
          if (!isOutpoint(prevout) || !isHex(prevout.script)) {
            return false;
          }

          return isSafeInteger(prevout.tokens) && prevout.tokens >= 0;
        };

        if (!isArray(args.prevouts) || !args.prevouts.every(isPrevout)) {
          return cbk([400, 'ExpectedPrevoutsToSignSettlement']);
        }

        if (!args.psbt) {
          return cbk([400, 'ExpectedPsbtToSignSettlement']);
        }

        if (!args.service || !args.service.pushStaticAddressSweeplessSigs) {
          return cbk([400, 'ExpectedServiceToSignSettlement']);
        }

        if (!args.service_public_key) {
          return cbk([400, 'ExpectedServiceKeyToSignSettlement']);
        }

        if (!isArray(args.swaps) || args.swaps.some(swap => !swap)) {
          return cbk([400, 'ExpectedSwapsToSignSettlement']);
        }

        // A utxo is an outpoint with a value
        const isUtxo = utxo => {
          if (!isOutpoint(utxo)) {
            return false;
          }

          return isSafeInteger(utxo.tokens) && utxo.tokens > 0;
        };

        // A swap has an id, tokens, and utxos that pay for the swap tokens
        const isSwap = swap => {
          if (!isHash(swap.id) || !isArray(swap.utxos)) {
            return false;
          }

          if (!isSafeInteger(swap.tokens) || swap.tokens <= 0) {
            return false;
          }

          return swap.utxos.every(isUtxo) && swap.tokens <= sumOf(swap.utxos);
        };

        if (!args.swaps.every(isSwap)) {
          return cbk([400, 'ExpectedValidSwapsToSignSettlement']);
        }

        const ids = args.swaps.map(n => n.id.toLowerCase());

        if (new Set(ids).size !== ids.length) {
          return cbk([400, 'UnexpectedDuplicateSwapToSignSettlement']);
        }

        const utxos = flatten(args.swaps.map(n => n.utxos));

        const utxoIds = utxos.map(n => outpoint(n).toLowerCase());

        // A utxo can only belong to one swap
        if (new Set(utxoIds).size !== utxoIds.length) {
          return cbk([400, 'UnexpectedUtxoInMultipleSwapsToSignSettlement']);
        }

        if (!args.swaps.find(n => isSameHash(n.id, args.id))) {
          return cbk([400, 'ExpectedSwapForCoopSettlement']);
        }

        return cbk();
      },

      // Get the swap payment request to see if the swap is paid
      getInvoice: ['validate', ({}, cbk) => {
        return getInvoice({id: args.id, lnd: args.lnd}, cbk);
      }],

      // The swap utxos are only cosigned away once the swap is paid
      checkPaid: ['getInvoice', ({getInvoice}, cbk) => {
        if (!getInvoice.is_confirmed) {
          return cbk([425, 'ExpectedPaidSwapToSignSettlement']);
        }

        return cbk();
      }],

      // Get the shared address client public key
      getKey: ['checkPaid', ({}, cbk) => {
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
          throw [400, 'FailedToDeriveSharedAddressToSignSettlement', {err}];
        }
      })],

      // Get the unsigned sweep transaction out of the PSBT
      sweep: ['checkPaid', asyncify(({}) => {
        try {
          const decoded = decodePsbt({psbt: args.psbt});

          const transaction = decoded.unsigned_transaction;

          const tx = componentsOfTransaction({transaction});

          return {
            inputs: tx.inputs.map(asOutpoint),
            outputs: tx.outputs,
            transaction,
          };
        } catch (err) {
          throw [400, 'ExpectedValidPsbtToSignSettlement', {err}];
        }
      })],

      // Check every sweep input has a unique prevout
      outpoints: ['address', 'sweep', ({sweep}, cbk) => {
        // Inputs are unique since a PSBT cannot spend an outpoint twice
        const inputs = sweep.inputs.map(n => outpoint(n).toLowerCase());

        const prevouts = args.prevouts.map(n => outpoint(n).toLowerCase());

        if (new Set(prevouts).size !== prevouts.length) {
          return cbk([400, 'UnexpectedDuplicatePrevoutInCoopSettlement']);
        }

        // Every input needs its spent output to derive the hashes to sign
        if (inputs.length !== prevouts.length) {
          return cbk([400, 'ExpectedPrevoutForEveryInputInCoopSettlement']);
        }

        if (inputs.some(input => !prevouts.includes(input))) {
          return cbk([400, 'ExpectedPrevoutForEveryInputInCoopSettlement']);
        }

        return cbk(null, {inputs, prevouts});
      }],

      // Check the utxos to sign are swap utxos spent by the sweep
      signing: ['address', 'outpoints', ({address, outpoints}, cbk) => {
        const {inputs, prevouts} = outpoints;
        const swap = args.swaps.find(n => isSameHash(n.id, args.id));

        const swapUtxos = swap.utxos.map(n => outpoint(n).toLowerCase());
        const signing = args.nonces.map(n => outpoint(n).toLowerCase());

        if (new Set(signing).size !== signing.length) {
          return cbk([400, 'UnexpectedDuplicateUtxoInCoopSettlement']);
        }

        // Only utxos of the swap are signed in the sweep
        if (signing.some(id => !swapUtxos.includes(id))) {
          return cbk([400, 'UnexpectedUtxoToSignInCoopSettlement']);
        }

        if (signing.some(id => !inputs.includes(id))) {
          return cbk([400, 'ExpectedUtxoToSignInCoopSettlementInputs']);
        }

        // The utxos to sign have to spend the shared address utxos
        const isUtxoSpend = utxo => {
          const id = outpoint(utxo).toLowerCase();

          const prevout = args.prevouts[prevouts.indexOf(id)];

          if (prevout.script !== address.output_script) {
            return false;
          }

          const known = swap.utxos[swapUtxos.indexOf(id)];

          return prevout.tokens === known.tokens;
        };

        if (!args.nonces.every(isUtxoSpend)) {
          return cbk([400, 'ExpectedSharedAddressSpendsInCoopSettlement']);
        }

        return cbk();
      }],

      // Check every swept utxo is known and its swap change is paid back
      change: [
        'address',
        'outpoints',
        'signing',
        'sweep',
        ({address, outpoints, sweep}, cbk) =>
      {
        const {inputs} = outpoints;

        // Every shared address utxo in the sweep has to belong to a swap
        const swapsByUtxo = args.swaps.reduce((sum, swap) => {
          swap.utxos.forEach(n => sum[outpoint(n).toLowerCase()] = swap);

          return sum;
        },
        {});

        const isUnknownUtxo = prevout => {
          if (prevout.script !== address.output_script) {
            return false;
          }

          return !swapsByUtxo[outpoint(prevout).toLowerCase()];
        };

        if (args.prevouts.some(isUnknownUtxo)) {
          return cbk([400, 'UnexpectedUnknownUtxoInCoopSettlement']);
        }

        // Swaps with utxos in the sweep get change back to the address
        const sweptSwaps = inputs
          .map(n => swapsByUtxo[n])
          .filter(n => !!n)
          .filter((swap, i, swaps) => swaps.indexOf(swap) === i);

        const change = sweptSwaps.reduce((sum, swap) => {
          return sum + sumOf(swap.utxos) - swap.tokens;
        },
        0);

        const isChange = ({script, tokens}) => {
          return script === address.output_script && tokens === change;
        };

        if (!!change && !sweep.outputs.find(isChange)) {
          return cbk([400, 'ExpectedChangeToSharedAddress', {change}]);
        }

        return cbk();
      }],

      // Spends are the outputs spent by the inputs in input order
      spends: ['change', 'outpoints', ({outpoints}, cbk) => {
        const {inputs, prevouts} = outpoints;

        const spends = inputs.map(input => {
          const prevout = args.prevouts[prevouts.indexOf(input)];

          return {script: prevout.script, tokens: prevout.tokens};
        });

        return cbk(null, spends);
      }],

      // Partially sign the swap utxos in the sweep
      sign: [
        'address',
        'outpoints',
        'spends',
        'sweep',
        ({address, outpoints, spends, sweep}, cbk) =>
      {
        return asyncMapSeries(args.nonces, (utxo, cbk) => {
          const {hash} = v1HashToSign({
            spends,
            sighash: sighashDefault,
            transaction: sweep.transaction,
            vin: outpoints.inputs.indexOf(outpoint(utxo).toLowerCase()),
          });

          return partialSignSharedAddress({
            hash,
            key_family: args.key_family,
            key_index: args.key_index,
            lnd: args.lnd,
            nonce: utxo.nonce,
            output_script: address.output_script,
            root_hash: address.root_hash,
            service_public_key: args.service_public_key,
          },
          cbk);
        },
        cbk);
      }],

      // Push the signatures to the swap service
      push: ['sign', 'sweep', ({sign, sweep}, cbk) => {
        const {id} = idForTransaction({transaction: sweep.transaction});

        // Signing info is keyed by the utxo outpoint
        const info = args.nonces.reduce((sum, utxo, i) => {
          sum[outpoint(utxo).toLowerCase()] = {
            nonce: hexAsBuffer(sign[i].nonce),
            sig: hexAsBuffer(sign[i].signature),
          };

          return sum;
        },
        {});

        return args.service.pushStaticAddressSweeplessSigs({
          signing_info: info,
          swap_hash: hexAsBuffer(args.id),
          txid: reversed(hexAsBuffer(id)),
        },
        args.metadata,
        err => {
          if (!!err) {
            return cbk([503, 'UnexpectedErrorPushingSettlementSigs', {err}]);
          }

          return cbk(null, {transaction_id: id});
        });
      }],
    },
    returnResult({reject, resolve, of: 'push'}, cbk));
  });
};

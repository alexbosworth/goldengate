const asyncAuto = require('async/auto');
const {beginGroupSigningSession} = require('ln-service');
const {endGroupSigningSession} = require('ln-service');
const {returnResult} = require('asyncjs-util');
const tinysecp = require('tiny-secp256k1');
const {Transaction} = require('bitcoinjs-lib');
const {updateGroupSigningSession} = require('ln-service');

const {taprootCoopPsbt} = require('./../taproot');
const {taprootVersion} = require('./conf/swap_service');

const bufferAsHex = buffer => buffer.toString('hex');
const {fromHex} = Transaction;
const hexAsBuffer = hex => Buffer.from(hex, 'hex');
const {isArray} = Array;
const {isBuffer} = Buffer;

/** Get a cooperative signed sweep transaction for a Taproot MuSig2 sweep

  {
    fee_tokens_per_vbyte: <Chain Fee Tokens Per VByte Number>
    funding_hash: <Funding Request Hash Hex String>
    funding_payment: <Funding Request Payment Nonce Hex String>
    key_family: <Signing Key Family Number>
    key_index: <Signing Key Family Number>
    lnd: <Authenticated LND API Object>
    network: <Network Name String>
    output_script: <Output Script Hex String>
    public_keys: [<Top Level Public Key Hex String>]
    root_hash: <Root Script Hash Hex String>
    script_branches: [{
      script: <Leaf Script Hex String>
    }]
    [sends]: [{
      address: <Delivery Address String>
      tokens: <Send Tokens Number>
    }]
    service: <Swap Service Object>
    sweep_address: <Sweep Tokens to Address String>
    tokens: <UTXO Tokens Number>
    transaction_id: <UTXO Transaction Id Hex String>
    transaction_vout: <UTXO Transaction Vout Hex String>
  }

  @returns via cbk or Promise
  {
    transaction: <Signed Transaction Hex String>
  }
*/
module.exports = (args, cbk) => {
  return new Promise((resolve, reject) => {
    return asyncAuto({
      // Import the ECPair library
      ecp: async () => (await import('ecpair')).ECPairFactory(tinysecp),

      // Check arguments
      validate: cbk => {
        if (!args.fee_tokens_per_vbyte) {
          return cbk([400, 'ExpectedChainFeeRateToGetCoopSignedTransaction']);
        }

        if (!args.funding_hash) {
          return cbk([400, 'ExpectedFundingPreimageHashToGetCoopSignedTx']);
        }

        if (!args.funding_payment) {
          return cbk([400, 'ExpectedPaymentNonceToGetCoopSignedTransaction']);
        }

        if (args.key_family === undefined) {
          return cbk([400, 'ExpectedKeyFamilyToGetCoopSignedTransaction']);
        }

        if (args.key_index === undefined) {
          return cbk([400, 'ExpectedKeyIndexToGetCoopSignedTransaction']);
        }

        if (!args.lnd) {
          return cbk([400, 'ExpectedAuthenticatedLndToGetCoopSignedTx']);
        }

        if (!args.network) {
          return cbk([400, 'ExpectedNetworkNameToGetCoopSignedTransaction']);
        }

        if (!args.output_script) {
          return cbk([400, 'ExpectedOutputScriptToGetCoopSignedTransaction']);
        }

        if (!isArray(args.public_keys)) {
          return cbk([400, 'ExpectedArrayOfPublicKeysToGetCoopSignedTx']);
        }

        if (!args.root_hash) {
          return cbk([400, 'ExpectedRootHashToGetCoopSignedTx']);
        }

        if (!isArray(args.script_branches)) {
          return cbk([400, 'ExpectedArrayOfBranchesToGetCoopSignedTx']);
        }

        if (!args.service || !args.service.muSig2SignSweep) {
          return cbk([400, 'ExpectedSwapServiceToGetCoopSignedTransaction']);
        }

        if (!args.sweep_address) {
          return cbk([400, 'ExpectedSweepAddressToGetCoopSignedTx']);
        }

        if (!args.tokens) {
          return cbk([400, 'ExpectedSweepTokensToGetCoopSignedTx']);
        }

        if (!args.transaction_id) {
          return cbk([400, 'ExpectedTransactionIdToGetCoopSignedTx']);
        }

        if (args.transaction_vout === undefined) {
          return cbk([400, 'ExpectedTransactionOutputIndexToGetCoopSignedTx']);
        }

        return cbk();
      },

      // Start a group signing session for the sweep
      begin: ['validate', ({}, cbk) => {
        return beginGroupSigningSession({
          lnd: args.lnd,
          key_family: args.key_family,
          key_index: args.key_index,
          public_keys: args.public_keys,
          root_hash: args.root_hash,
        },
        cbk);
      }],

      // Assemble the PSBT to submit to the server
      unsigned: ['ecp', 'validate', ({ecp}, cbk) => {
        try {
          const {hash, psbt, transaction} = taprootCoopPsbt({
            ecp,
            fee_tokens_per_vbyte: args.fee_tokens_per_vbyte,
            network: args.network,
            output_script: args.output_script,
            script_branches: args.script_branches,
            sends: args.sends,
            sweep_address: args.sweep_address,
            tokens: args.tokens,
            transaction_id: args.transaction_id,
            transaction_vout: args.transaction_vout,
          });

          return cbk(null, {hash, psbt, transaction});
        } catch (err) {
          return cbk([400, err.message]);
        }
      }],

      // Request the partial signature from the server
      request: ['begin', 'unsigned', ({begin, unsigned}, cbk) => {
        return args.service.muSig2SignSweep({
          nonce: hexAsBuffer(begin.nonce),
          payment_address: hexAsBuffer(args.funding_payment),
          protocol_version: taprootVersion,
          swap_hash: hexAsBuffer(args.funding_hash),
          sweep_tx_psbt: hexAsBuffer(unsigned.psbt),
        },
        args.metadata,
        (err, res) => {
          if (!!err) {
            return cbk([503, 'UnexpectedErrorGettingCoopSignedTx', {err}]);
          }

          if (!res) {
            return cbk([503, 'ExpectedResponseForCoopSignTxRequest']);
          }

          if (!isBuffer(res.nonce)) {
            return cbk([503, 'ExpectedCoopSignNonceInCoopSignResponse']);
          }

          if (!isBuffer(res.partial_signature)) {
            return cbk([503, 'ExpectedCoopPartialSigInCoopSignResponse']);
          }

          return cbk(null, {
            nonce: bufferAsHex(res.nonce),
            signature: bufferAsHex(res.partial_signature),
          });
        });
      }],

      // Update the group signing session with the partial signature
      update: [
        'begin',
        'request',
        'unsigned',
        ({begin, request, unsigned}, cbk) =>
      {
        return updateGroupSigningSession({
          hash: unsigned.hash,
          id: begin.id,
          lnd: args.lnd,
          nonces: [request.nonce],
        },
        cbk);
      }],

      // End the group signing session to get a joint signature
      end: ['begin', 'request', 'update', ({begin, request, update}, cbk) => {
        return endGroupSigningSession({
          id: begin.id,
          lnd: args.lnd,
          signatures: [request.signature],
        },
        cbk);
      }],

      // Assemble the signed sweep
      signed: ['end', 'unsigned', ({end, unsigned}, cbk) => {
        const tx = fromHex(unsigned.transaction);

        // Generate signatures and attach witnesses to the transaction
        tx.ins.forEach((input, vin) => {
          return tx.setWitness(vin, [hexAsBuffer(end.signature)]);
        });

        return cbk(null, {transaction: tx.toHex()});
      }],
    },
    returnResult({reject, resolve, of: 'signed'}, cbk));
  });
};

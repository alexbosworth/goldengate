const asyncAuto = require('async/auto');
const {fundPsbt} = require('ln-service');
const {returnResult} = require('asyncjs-util');
const {signPsbt} = require('ln-service');
const {Transaction} = require('bitcoinjs-lib');

const askForFeeRate = require('./ask_for_fee_rate');

const {fromHex} = Transaction;
const {isArray} = Array;

/** Get a funded tx using internal LND funds

  {
    ask: <Inquirer Ask Function>
    [chain_fee_tokens_per_vbyte]: <Tokens Per VByte Number>
    lnd: <Authenticated LND API Object>
    outputs: [{
      address: <Chain Address String>
      tokens: <Send Tokens Tokens Number>
    }]
  }

  @returns via cbk or Promise
  {
    id: <Transaction Id Hex String>
    inputs: [{
      [lock_expires_at]: <UTXO Lock Expires At ISO 8601 Date String>
      [lock_id]: <UTXO Lock Id Hex String>
      transaction_id: <Unspent Transaction Id Hex String>
      transaction_vout: <Unspent Transaction Output Index Number>
    }]
    psbt: <Finalized PSBT Hex String>
    transaction: <Signed Raw Transaction Hex String>
  }
*/
module.exports = (args, cbk) => {
  return new Promise((resolve, reject) => {
    return asyncAuto({
      // Check arguments
      validate: cbk => {
        if (!args.ask) {
          return cbk([400, 'ExpectedAskFunctionToGetInternalFundedTx']);
        }

        if (!args.lnd) {
          return cbk([400, 'ExpectedLndToGetInternalFundedTransaction']);
        }

        if (!isArray(args.outputs)) {
          return cbk([400, 'ExpectedArrayOfOutputsToGetInternalFundedTx']);
        }

        return cbk();
      },

      // Ask for fee rate to use for internal funding
      askForFeeRate: ['validate', ({}, cbk) => {
        // Exit early when the fee rate was already set
        if (!!args.chain_fee_tokens_per_vbyte) {
          return cbk(null, {
            tokens_per_vbyte: args.chain_fee_tokens_per_vbyte,
          });
        }

        return askForFeeRate({ask: args.ask, lnd: args.lnd}, cbk);
      }],

      // Create a PSBT to the outputs
      createPsbt: ['askForFeeRate', ({askForFeeRate}, cbk) => {
        return fundPsbt({
          fee_tokens_per_vbyte: askForFeeRate.tokens_per_vbyte,
          lnd: args.lnd,
          outputs: args.outputs,
        },
        cbk);
      }],

      // Sign the PSBT to get a finalized PSBT and a signed transaction
      signPsbt: ['createPsbt', ({createPsbt}, cbk) => {
        return signPsbt({lnd: args.lnd, psbt: createPsbt.psbt}, cbk);
      }],

      // Funded transaction result
      funded: ['createPsbt', 'signPsbt', ({createPsbt, signPsbt}, cbk) => {
        return cbk(null, {
          id: fromHex(signPsbt.transaction).getId(),
          inputs: createPsbt.inputs,
          psbt: signPsbt.psbt,
          transaction: signPsbt.transaction,
        });
      }],
    },
    returnResult({reject, resolve, of: 'funded'}, cbk));
  });
};

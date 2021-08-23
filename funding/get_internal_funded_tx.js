const asyncAuto = require('async/auto');
const {fundPsbt} = require('ln-service');
const {getChainFeeRate} = require('ln-service');
const {returnResult} = require('asyncjs-util');
const {signPsbt} = require('ln-service');
const {Transaction} = require('bitcoinjs-lib');

const fastConfirmationTarget = 2;
const {floor} = Math;
const {fromHex} = Transaction;
const {isArray} = Array;
const maxMultiplier = 100;
const slowConfirmationTarget = 1e3;

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

      // Get the default chain fee rate
      getDefaultChainFeeRate: ['validate', ({}, cbk) => {
        return getChainFeeRate({lnd: args.lnd}, cbk);
      }],

      // Get the maximum chain fee rate
      getMaxChainFeeRate: ['validate', ({}, cbk) => {
        return getChainFeeRate({
          confirmation_target: fastConfirmationTarget,
          lnd: args.lnd,
        },
        cbk);
      }],

      // Get the minimum chain fee rate
      getMinChainFeeRate: ['validate', ({}, cbk) => {
        return getChainFeeRate({
          confirmation_target: slowConfirmationTarget,
          lnd: args.lnd,
        },
        cbk);
      }],

      // Ask for fee rate to use for internal funding
      askForFeeRate: [
        'getDefaultChainFeeRate',
        'getMaxChainFeeRate',
        'getMinChainFeeRate',
        ({
          getDefaultChainFeeRate,
          getMaxChainFeeRate,
          getMinChainFeeRate,
        },
        cbk) =>
      {
        // Exit early when the fee rate was already set
        if (!!args.chain_fee_tokens_per_vbyte) {
          return cbk(null, args.chain_fee_tokens_per_vbyte);
        }

        return args.ask({
          default: getDefaultChainFeeRate.tokens_per_vbyte,
          message: 'Chain fee per vbyte?',
          name: 'rate',
          type: 'number',
        },
        ({rate}) => cbk(null, rate));
      }],

      // Create a PSBT to the outputs
      createPsbt: [
        'askForFeeRate',
        'getMaxChainFeeRate',
        'getMinChainFeeRate',
        ({
          askForFeeRate,
          getMaxChainFeeRate,
          getMinChainFeeRate,
        },
        cbk) =>
      {
        const hasFee = !!args.chain_fee_tokens_per_vbyte;

        const maxFee = getMaxChainFeeRate.tokens_per_vbyte * maxMultiplier;
        const minFee = floor(getMinChainFeeRate.tokens_per_vbyte);

        if (!hasFee && askForFeeRate > maxFee) {
          return cbk([400, 'MaxFeePerVbyteExceeded', {maximum: maxFee}]);
        }

        if (!hasFee && (!askForFeeRate || askForFeeRate < minFee)) {
          return cbk([400, 'ExpectedHigherMinFeePerVbyte', {minimum: minFee}]);
        }

        return fundPsbt({
          fee_tokens_per_vbyte: askForFeeRate,
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

const asyncAuto = require('async/auto');
const {returnResult} = require('asyncjs-util');

const getExternalFundedTransaction = require('./get_external_funded_tx');
const getInternalFundedTransaction = require('./get_internal_funded_tx');
const isExternalFunding = require('./is_external_funding');

const {isArray} = Array;

/** Get a funded transaction

  {
    ask: <Inquirer Ask Function>
    [chain_fee_tokens_per_vbyte]: <Internal Funding Uses Tokens/Vbyte Number>
    [is_external]: <Transaction Uses External Funds Bool>
    lnd: Authenticated LND API Object>
    logger: <Winston Logger Object>
    outputs: [{
      address: <Chain Address String>
      tokens: <Tokens To Send To Output Number>
    }]
  }

  @returns via cbk or Promise
  {
    id: <Transaction Id Hex String>
    [inputs]: [{
      [lock_id]: <UTXO Lock Id Hex String>
      transaction_id: <Transaction Hex Id String>
      transaction_vout: <Transaction Output Index Number>
    }]
    [psbt]: <Transaction As Finalized PSBT Hex String>
    [transaction]: <Raw Transaction Hex String>
  }
*/
module.exports = (args, cbk) => {
  return new Promise((resolve, reject) => {
    return asyncAuto({
      // Check arguments
      validate: cbk => {
        if (!args.ask) {
          return cbk([400, 'ExpectedAskFunctionToGetFundedTransaction']);
        }

        if (!args.lnd) {
          return cbk([400, 'ExpectedAuthenticatedLndApiToGetFundedTx']);
        }

        if (!args.logger) {
          return cbk([400, 'ExpectedWinstonLoggerToGetFundedTransaction']);
        }

        if (!isArray(args.outputs)) {
          return cbk([400, 'ExpectedArrayOfOutputsToGetFundedTransaction']);
        }

        return cbk();
      },

      // Check if the user wants to use internal funding or not
      isExternal: ['validate', ({}, cbk) => {
        if (args.is_external === true || args.is_external === false) {
          return cbk(null, {is_external: args.is_external});
        }

        return isExternalFunding({
          ask: args.ask,
          lnd: args.lnd,
          logger: args.logger,
          outputs: args.outputs,
        },
        cbk);
      }],

      // Prompt for a PSBT or a signed transaction
      getExternal: ['isExternal', ({isExternal}, cbk) => {
        // Exit early when not using an external funding source
        if (!isExternal.is_external) {
          return cbk();
        }

        return getExternalFundedTransaction({
          ask: args.ask,
          logger: args.logger,
          outputs: args.outputs,
        },
        cbk);
      }],

      // Create a funded PSBT
      getInternal: ['isExternal', ({isExternal}, cbk) => {
        // Exit early when the funding is from internal funds
        if (!!isExternal.is_external) {
          return cbk();
        }

        return getInternalFundedTransaction({
          ask: args.ask,
          chain_fee_tokens_per_vbyte: args.chain_fee_tokens_per_vbyte,
          lnd: args.lnd,
          outputs: args.outputs,
        },
        cbk);
      }],

      // Final funded transaction
      funded: [
        'getExternal',
        'getInternal',
        ({getExternal, getInternal}, cbk) =>
      {
        return cbk(null, getExternal || getInternal);
      }],
    },
    returnResult({reject, resolve, of: 'funded'}, cbk));
  });
};

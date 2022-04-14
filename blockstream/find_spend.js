const asyncAuto = require('async/auto');
const {returnResult} = require('asyncjs-util');

const getHeightFromBlockstream = require('./get_height_from_blockstream');
const getTxsFromBlockstream = require('./get_txs_from_blockstream');

const confs = (height, confirmed) => !confirmed ? 0 : height - confirmed + 1;
const {isArray} = Array;

/** Find a spend to an address that is spending a UTXO

  Either `address` or `output_script` is required

  Either `tokens` or `transaction_id`/`transaction_vout` is required

  {
    [address]: <Spends To Address String>
    [confirmations]: <Required Confirmations Count>
    network: <Network Name String>
    [output_script]: <Output Script Hex String>
    request: <Request Function>
    [tokens]: <UTXO Value Tokens Number>
    [transaction_id]: <Spending Transaction Id Hex String>
    [transaction_vout]: <Spending Transaction Vout Number>
  }

  @returns via cbk or Promise
  {
    [confirm_height]: <Spend Confirm Height Number>
    output_tokens: <Transaction Output Tokens Number>
    transaction_id: <Transaction Id Hex String>
    transaction_vout: <Transaction Output Index Number>
  }
*/
module.exports = (args, cbk) => {
  return new Promise((resolve, reject) => {
    return asyncAuto({
      // Check arguments
      validate: cbk => {
        if (!args.address && !args.output_script) {
          return cbk([400, 'ExpectedAddressOrOutputScriptToFindSpend']);
        }

        if (!args.network) {
          return cbk([400, 'ExpectedKnownNetworkToFindSpend']);
        }

        if (!args.request) {
          return cbk([400, 'ExpectedRequestFunctionToFindSpend']);
        }

        if (!args.tokens && !args.transaction_id) {
          return cbk([400, 'ExpectedTokensWhenOutpointUndefinedFindingSpend']);
        }

        if (!!args.transaction_id && args.transaction_vout === undefined) {
          return cbk([400, 'ExpectedTransactionVoutWhenFindingSpend']);
        }

        return cbk();
      },

      // Get the current height
      getHeight: ['validate', ({}, cbk) => {
        return getHeightFromBlockstream({
          network: args.network,
          request: args.request,
        },
        cbk);
      }],

      // Get transactions associated with an address
      getTransactions: ['getHeight', ({}, cbk) => {
        return getTxsFromBlockstream({
          address: args.address,
          network: args.network,
          request: args.request,
          script: args.output_script,
        },
        cbk);
      }],

      // Find the spend in the transactions
      spend: [
        'getHeight',
        'getTransactions',
        ({getHeight, getTransactions}, cbk) =>
      {
        const {transactions} = getTransactions;

        if (!transactions.length) {
          return cbk([404, 'ExpectedTxsForSpendToAddress']);
        }

        // Find the spend in the transactions
        const [spend] = transactions.filter(tx => {
          const confirmations = confs(getHeight.height, tx.confirm_height);

          if (!!args.confirmations && !confirmations) {
            return false;
          }

          if (!!args.confirmations && confirmations < args.confirmations) {
            return false;
          }

          // Look for the specified outpoint spend
          const hasInput = !!tx.inputs.find(input => {
            // Any input will do when there is no tx id spend specified
            if (!args.transaction_id) {
              return true;
            }

            // Input should be spending the specified tx id
            if (input.transaction_id !== args.transaction_id) {
              return false;
            }

            // Input should be spending the specified tx vout
            if (input.transaction_vout !== args.transaction_vout) {
              return false;
            }

            return true;
          });

          // Look for the outputs paying to the address
          const outputsToAddress = tx.outputs.filter(output => {
            if (!!args.address && output.address !== args.address) {
              return false;
            }

            if (!!args.output_script && output.script !== args.output_script) {
              return false;
            }

            // When tokens are specified, make sure the output is correct
            if (!!args.tokens && output.tokens !== args.tokens) {
              return false;
            }

            return true;
          });

          return hasInput && outputsToAddress.length === [args.tokens].length;
        });

        if (!spend) {
          return cbk([404, 'FailedToFindSpendToAddress']);
        }

        // Find the output on the transaction
        const output = spend.outputs.find(output => {
          if (!!args.address) {
            return output.address === args.address;
          }

          return output.script === args.output_script;
        });

        return cbk(null, {
          confirm_height: spend.confirm_height,
          output_tokens: output.tokens,
          transaction_id: spend.id,
          transaction_vout: output.index,
        });
      }],
    },
    returnResult({reject, resolve, of: 'spend'}, cbk));
  });
};

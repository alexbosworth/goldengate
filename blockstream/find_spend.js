const asyncAuto = require('async/auto');
const {returnResult} = require('asyncjs-util');

const getHeightFromBlockstream = require('./get_height_from_blockstream');
const getTxsFromBlockstream = require('./get_txs_from_blockstream');

const confs = (height, confirmed) => !confirmed ? 0 : height - confirmed + 1;
const {isArray} = Array;

/** Find a spend to an address that is spending a UTXO

  Either `tokens` or `transaction_id`/`transaction_vout` is required

  {
    address: <Spends To Address String>
    [confirmations]: <Required Confirmations Count>
    network: <Network Name String>
    request: <Request Function>
    [tokens]: <UTXO Value Tokens Number>
    [transaction_id]: <Spending Transaction Id Hex String>
    [transaction_vout]: <Spending Transaction Vout Number>
  }

  @returns via cbk
  {
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
        if (!args.address) {
          return cbk([400, 'ExpectedAddressToFindSpend']);
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
            if (output.address !== args.address) {
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
        const output = spend.outputs.find(n => n.address === args.address);

        return cbk(null, {
          output_tokens: output.tokens,
          transaction_id: spend.id,
          transaction_vout: output.index,
        });
      }],
    },
    returnResult({reject, resolve, of: 'spend'}, cbk));
  });
};

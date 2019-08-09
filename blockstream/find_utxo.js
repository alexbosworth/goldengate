const asyncAuto = require('async/auto');
const {returnResult} = require('asyncjs-util');

const {apis} = require('./conf/blockstream-info');
const getHeightFromBlockstream = require('./get_height_from_blockstream');
const getUtxosFromBlockstream = require('./get_utxos_from_blockstream');

const {isArray} = Array;

/** Find a UTXO with an output script matching an address

  {
    address: <UTXO Address String>
    confirmations: <Required Confirmations Count>
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
          return cbk([400, 'ExpectedAddressToFindUtxo']);
        }

        if (args.confirmations === undefined) {
          return cbk([400, 'ExpectedConfirmationsCountToFindUtxo']);
        }

        if (!args.network || !apis[args.network]) {
          return cbk([400, 'ExpectedKnownNetworkToFindUtxo']);
        }

        if (!args.request) {
          return cbk([400, 'ExpectedRequestFunctionToFindUtxo']);
        }

        if (!args.tokens && !args.transaction_id) {
          return cbk([400, 'ExpectedUtxoTokensWhenFindingUtxo']);
        }

        if (!!args.transaction_id && args.transaction_vout === undefined) {
          return cbk([400, 'ExpectedTransactionVoutWhenLookingForUtxoSpend']);
        }

        return cbk();
      },

      // Find utxo
      getUtxo: ['validate', ({}, cbk) => {
        return getUtxosFromBlockstream({
          address: args.address,
          network: args.network,
          request: args.request,
        },
        (err, res) => {
          if (!!err) {
            return cbk(err);
          }

          const {utxos} = res;

          if (!utxos.length) {
            return cbk([503, 'ExpectedUtxosForDepositAddress']);
          }

          const [utxo] = utxos.filter(utxo => {
            return !args.tokens || utxo.tokens === args.tokens;
          });

          if (!utxo) {
            return cbk([503, 'UnexpectedTokensValueForFoundUtxo']);
          }

          const txId = args.transaction_id;

          if (!!txId && utxo.transaction_id !== txId) {
            return cbk([503, 'UnexpectedSpendingUtxoTransactionId']);
          }

          if (!!txId && utxo.transaction_vout !== args.transaction_vout) {
            return cbk([503, 'UnexpectedSpendingUtxoTransactionVout']);
          }

          return cbk(null, {
            block_height: utxo.confirm_height,
            output_tokens: utxo.tokens,
            transaction_id: utxo.transaction_id,
            transaction_vout: utxo.transaction_vout,
          });
        });
      }],

      // Get the current height
      getHeight: ['getUtxo', ({}, cbk) => {
        return getHeightFromBlockstream({
          network: args.network,
          request: args.request,
        },
        cbk);
      }],

      // Check that the current height matches the confirmation expectation
      checkHeight: ['getHeight', 'getUtxo', ({getHeight, getUtxo}, cbk) => {
        // Exit early when no confirmations are required
        if (!args.confirmations) {
          return cbk();
        }

        const confs = getHeight.height - getUtxo.block_height;

        if (confs + [getUtxo].length < args.confirmations) {
          return cbk([503, 'ExpectedMoreWorkOnTopOfUtxo']);
        }

        return cbk();
      }],

      // Utxo
      utxo: ['getUtxo', ({getUtxo}, cbk) => {
        return cbk(null, {
          output_tokens: getUtxo.output_tokens,
          transaction_id: getUtxo.transaction_id,
          transaction_vout: getUtxo.transaction_vout,
        });
      }],
    },
    returnResult({reject, resolve, of: 'utxo'}, cbk));
  });
};

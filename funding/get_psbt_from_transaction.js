const asyncAuto = require('async/auto');
const asyncMapSeries = require('async/mapSeries');
const {finalizePsbt} = require('psbt');
const {returnResult} = require('asyncjs-util');
const {Transaction} = require('bitcoinjs-lib');
const {transactionAsPsbt} = require('psbt');

const {getTxFromBlockstream} = require('./../blockstream');

const bufferAsHex = buffer => buffer.toString('hex');
const {fromHex} = Transaction;
const retries = 10;
const uniq = arr => Array.from(new Set(arr));

/** Get a PSBT from a raw transaction

  {
    network: <Network Name String>
    request: <Request Function>
    transaction: <Raw Transaction Hex String>
  }

  @returns via cbk or Promise
  {
    psbt: <Finalized PSBT Hex String>
  }
*/
module.exports = ({network, request, transaction}, cbk) => {
  return new Promise((resolve, reject) => {
    return asyncAuto({
      // Check arguments
      validate: cbk => {
        if (!network) {
          return cbk([400, 'ExpectedNetworkNameToGetPsbtFromTransaction']);
        }

        if (!request) {
          return cbk([400, 'ExpectedRequestFunctionToGetPsbtFromTransaction']);
        }

        if (!transaction) {
          return cbk([400, 'ExpectedTransactionToGetPsbtFromTransaction']);
        }

        return cbk();
      },

      // Pull out input transaction ids
      ids: ['validate', ({}, cbk) => {
        const {ins} = fromHex(transaction);

        const ids = uniq(ins.map(n => bufferAsHex(n.hash.reverse())));

        return cbk(null, ids);
      }],

      // Get raw transactions that represent the coins for the tx
      getTransactions: ['ids', ({ids}, cbk) => {
        return asyncMapSeries(ids, (id, cbk) => {
          return getTxFromBlockstream({id, network, request, retries}, cbk);
        },
        cbk);
      }],

      // Finalize PSBT
      finalize: ['getTransactions', ({getTransactions}, cbk) => {
        const spending = getTransactions.map(n => n.transaction);

        try {
          const {psbt} = transactionAsPsbt({spending, transaction});

          const finalized = finalizePsbt({psbt});

          return cbk(null, {psbt: finalized.psbt});
        } catch (err) {
          return cbk([400, 'FailedToConvertTxToPsbt', {err}]);
        }
      }],
    },
    returnResult({reject, resolve, of: 'finalize'}, cbk));
  });
};

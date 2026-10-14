const asyncAuto = require('async/auto');
const asyncMapSeries = require('async/mapSeries');
const {componentsOfTransaction} = require('@alexbosworth/blockchain');
const {returnResult} = require('asyncjs-util');
const {unextractTransaction} = require('psbt');

const {getTxFromBlockstream} = require('./../blockstream');

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

        try {
          componentsOfTransaction({transaction});
        } catch (err) {
          return cbk([400, 'ExpectedValidTxToGetPsbtFromTransaction']);
        }

        return cbk();
      },

      // Pull out input transaction ids
      ids: ['validate', ({}, cbk) => {
        const {inputs} = componentsOfTransaction({transaction});

        return cbk(null, uniq(inputs.map(n => n.id)));
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
          const {psbt} = unextractTransaction({spending, transaction});

          return cbk(null, {psbt});
        } catch (err) {
          return cbk([400, 'FailedToConvertTxToPsbt', {err}]);
        }
      }],
    },
    returnResult({reject, resolve, of: 'finalize'}, cbk));
  });
};

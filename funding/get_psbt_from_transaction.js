const asyncAuto = require('async/auto');
const asyncMapSeries = require('async/mapSeries');
const {finalizePsbt} = require('psbt');
const {returnResult} = require('asyncjs-util');
const tinysecp = require('tiny-secp256k1');
const {Transaction} = require('bitcoinjs-lib');
const {unextractTransaction} = require('psbt');

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
      // Import the ECPair library
      ecp: async () => (await import('ecpair')).ECPairFactory(tinysecp),

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
      finalize: ['ecp', 'getTransactions', ({ecp, getTransactions}, cbk) => {
        const spending = getTransactions.map(n => n.transaction);

        try {
          const {psbt} = unextractTransaction({ecp, spending, transaction});

          return cbk(null, {psbt});
        } catch (err) {
          return cbk([400, 'FailedToConvertTxToPsbt', {err}]);
        }
      }],
    },
    returnResult({reject, resolve, of: 'finalize'}, cbk));
  });
};

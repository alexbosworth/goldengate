const asyncAuto = require('async/auto');
const {returnResult} = require('asyncjs-util');

const {apis} = require('./conf/blockstream-info');

const {isArray} = Array;

/** Get transactions related to an address from Blockstream

  {
    address: <Address String>
    network: <Network String>
    request: <Request Function>
  }

  @returns via cbk or Promise
  {
    transactions: [{
      id: <Transaction Id Hex String>
      inputs: [{
        witness: <Witness Hex String>
      }]
    }]
  }
*/
module.exports = ({address, network, request}, cbk) => {
  return new Promise((resolve, reject) => {
    return asyncAuto({
      // Check arguments
      validate: cbk => {
        if (!address) {
          return cbk([400, 'ExpectedAddressToFindTransactionsFor']);
        }

        if (!network) {
          return cbk([400, 'ExpectedNetworkToFindTransactionsForAddress']);
        }

        if (!request) {
          return cbk([400, 'ExpectedRequestToGetTxsFromBlockstream']);
        }

        return cbk();
      },

      // Get transactions
      getTransactions: ['validate', ({}, cbk) => {
        return request({
          json: true,
          url: `${apis[network]}/address/${address}/txs`,
        },
        (err, r, txs) => {
          if (!!err) {
            return cbk([503, 'FailedGettingTxsFromBlockstream', {err}]);
          }

          if (!r) {
            return cbk([503, 'ExpectedResponseGettingTxsFromBlockstream']);
          }

          if (r.statusCode !== 200) {
            return cbk([503, 'UnexpectedStatusGettingTxsFromBlockstream']);
          }

          if (!isArray(txs)) {
            return cbk([503, 'ExpectedTxArrayGettingTxsFromBlockstream']);
          }

          if (!!txs.find(({txid}) => !txid)) {
            return cbk([503, 'ExpectedTransactionIdInBlockstreamResponse']);
          }

          if (!!txs.find(({vin}) => !isArray(vin))) {
            return cbk([503, 'ExpectedArrayOfInputsInTxFromBlockstream']);
          }

          const transactions = txs.map(tx => ({id: tx.txid, inputs: tx.vin}));

          return cbk(null, {transactions});
        });
      }],
    },
    returnResult({reject, resolve, of: 'getTransactions'}, cbk));
  });
};

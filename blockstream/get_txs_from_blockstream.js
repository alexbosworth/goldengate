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
      [confirm_height]: <Transaction Confirmed In Block At Height Number>
      id: <Transaction Id Hex String>
      inputs: [{
        transaction_id: <Outpoint Transaction Id Hex String>
        transaction_vout: <Outpoint Transaction Output Index Number>
        witness: [<Witness Hex String>]
      }]
      outputs: [{
        address: <Sending To Address String>
        tokens: <Sending Tokens Number>
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

          if (!!txs.filter(n => !n).length) {
            return cbk([503, 'ExpectedTransactionFromBlockstreamInArray']);
          }

          if (!!txs.find(({txid}) => !txid)) {
            return cbk([503, 'ExpectedTransactionIdInBlockstreamResponse']);
          }

          if (!!txs.find(({vin}) => !isArray(vin))) {
            return cbk([503, 'ExpectedArrayOfInputsInTxFromBlockstream']);
          }

          if (!!txs.find(n => !n.status)) {
            return cbk([503, 'ExpectedTransactionStatusInBlockstreamTx']);
          }

          const transactions = txs.map(tx => {
            return {
              confirm_height: tx.status.block_height || undefined,
              id: tx.txid,
              inputs: tx.vin.map(input => {
                return {
                  transaction_id: input.txid,
                  transaction_vout: input.vout,
                  witness: input.witness,
                };
              }),
              outputs: tx.vout.map((output, index) => {
                return {
                  index,
                  address: output.scriptpubkey_address,
                  tokens: output.value,
                };
              }),
            };
          });

          return cbk(null, {transactions});
        });
      }],
    },
    returnResult({reject, resolve, of: 'getTransactions'}, cbk));
  });
};

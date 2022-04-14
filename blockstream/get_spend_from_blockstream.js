const asyncAuto = require('async/auto');
const {returnResult} = require('asyncjs-util');
const {Transaction} = require('bitcoinjs-lib');

const {apis} = require('./conf/blockstream-info');

const {fromHex} = Transaction;
const {isBuffer} = Buffer;
const isHash = n => !!n && /^[0-9A-F]{64}$/i.test(n);

/** Get a spend of an outpoint from Blockstream

  {
    network: <Network Name String>
    request: <Request Function>
    transaction_id: <Transaction Id Hex String>
    transaction_vout: <Transaction Output Index Number>
  }

  @returns via cbk or Promise
  {
    [transaction]: <Transaction Hex String>
  }
*/
module.exports = (args, cbk) => {
  return new Promise((resolve, reject) => {
    return asyncAuto({
      // Check arguments
      validate: cbk => {
        if (!args.network || !apis[args.network]) {
          return cbk([400, 'ExpectedKnownNetworkNameToGetSpend']);
        }

        if (!args.request) {
          return cbk([400, 'ExpectedRequestFunctionToGetSpend']);
        }

        if (!args.transaction_id) {
          return cbk([400, 'ExpectedTransactionIdToGetSpend']);
        }

        if (args.transaction_vout === undefined) {
          return cbk([400, 'ExpectedTransactionOutputIndexToGetSpend']);
        }

        return cbk();
      },

      // Get the spend
      getSpend: ['validate', ({}, cbk) => {
        const id = args.transaction_id;
        const vout = args.transaction_vout;

        const url = `${apis[args.network]}/tx/${id}/outspend/${vout}`;

        return args.request({url, json: true}, (err, r, res) => {
          if (!!err) {
            return cbk([503, 'UnexpectedErrorGettingSpend', {err}]);
          }

          if (!r) {
            return cbk([503, 'UnexpectedEmptyResponseGettingSpend']);
          }

          if (r.statusCode !== 200) {
            return cbk([503, 'UnexpectedStatusCodeGettingSpend']);
          }

          if (!res) {
            return cbk([503, 'ExpectedResponseForSpendDataQuery']);
          }

          // Exit early when there is no spend
          if (res.spent === false) {
            return cbk();
          }

          if (res.spent !== true) {
            return cbk([503, 'ExpectedSpendStatusInSpendDataQuery']);
          }

          if (!res.status) {
            return cbk([503, 'ExpectedSpendTransactionStatusInSpendResult']);
          }

          // Exit early when the spend is not confirmed
          if (!res.status.confirmed) {
            return cbk();
          }

          if (!isHash(res.txid)) {
            return cbk([503, 'ExpectedTransactionIdOfSpendInResponse']);
          }

          return cbk(null, res.txid);
        });
      }],

      // Get the raw spending transaction
      getTransaction: ['getSpend', ({getSpend}, cbk) => {
        // Exit early when there is no spend
        if (!getSpend) {
          return cbk(null, {});
        }

        const url = `${apis[args.network]}/tx/${getSpend}/hex`;

        return args.request({url}, (err, r, res) => {
          if (!!err) {
            return cbk([503, 'UnexpectedErrorGettingSpend', {err}]);
          }

          if (!r) {
            return cbk([503, 'UnexpectedEmptyResponseGettingSpend']);
          }

          if (r.statusCode !== 200) {
            return cbk([503, 'UnexpectedStatusCodeGettingSpend']);
          }

          if (!res) {
            return cbk([503, 'ExpectedRawHexTransactionForTxLookup']);
          }

          try {
            fromHex(res)
          } catch (err) {
            return cbk([503, 'ExpectedRawTransactionInSpendResponse']);
          }

          return cbk(null, {transaction: res});
        });
      }],
    },
    returnResult({reject, resolve, of: 'getTransaction'}, cbk));
  });
};

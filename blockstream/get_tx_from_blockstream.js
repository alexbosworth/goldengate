const asyncAuto = require('async/auto');
const asyncify = require('async/asyncify');
const asyncRetry = require('async/retry');
const {idForTransaction} = require('@alexbosworth/blockchain');
const {returnResult} = require('asyncjs-util');

const {apis} = require('./conf/blockstream-info');

const defaultInterval = n => 50 * Math.pow(2, n);
const isHash = n => !!n && /^[0-9A-F]{64}$/i.test(n);
const isHex = n => !!n && !(n.length % 2) && /^[0-9A-F]*$/i.test(n);

/** Get raw transaction hex

  {
    id: <Transaction Id Hex String>
    [interval]: <Retry Interval Milliseconds Number>
    network: <Network Name String>
    request: <Request Function>
    [retries]: <Retries Count Number>
  }

  @returns via cbk or Promise
  {
    transaction: <Transaction Hex String>
  }
*/
module.exports = ({id, interval, network, request, retries}, cbk) => {
  return new Promise((resolve, reject) => {
    return asyncAuto({
      // Check arguments
      validate: cbk => {
        if (!isHash(id)) {
          return cbk([400, 'ExpectedTransactionIdToGetRawTransaction']);
        }

        if (!network) {
          return cbk([400, 'ExpectedNetworkNameToGetRawTransaction']);
        }

        if (!apis[network]) {
          return cbk([400, 'UnsupportedNetworkToGetRawTransaction']);
        }

        if (!request) {
          return cbk([400, 'ExpectedRequestMethodToGetRawTrasaction']);
        }

        return cbk();
      },

      // Get the raw transaction
      getTransaction: ['validate', ({}, cbk) => {
        return asyncRetry({
          interval: interval || defaultInterval,
          times: retries,
        },
        cbk => {
          return request({
            url: `${apis[network]}/tx/${id}/hex`,
          },
          (err, r, transaction) => {
            if (!!err) {
              return cbk([503, 'FailedToGetRawTransaction', {err}]);
            }

            if (!isHex(transaction)) {
              return cbk([503, 'ExpectedTransactionInResponse']);
            }

            return cbk(null, {transaction});
          });
        },
        cbk);
      }],

      // Check the raw transaction is the transaction with the requested id
      transaction: ['getTransaction', asyncify(({getTransaction}) => {
        const {transaction} = getTransaction;

        try {
          idForTransaction({transaction});
        } catch (err) {
          throw [503, 'ExpectedValidTransactionInResponse'];
        }

        if (idForTransaction({transaction}).id !== id) {
          throw [503, 'ExpectedRawTransactionInResponse'];
        }

        return {transaction};
      })],
    },
    returnResult({reject, resolve, of: 'transaction'}, cbk));
  });
};

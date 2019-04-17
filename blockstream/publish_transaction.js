const request = require('request');

const {apis} = require('./conf/blockstream-info');

/** Publish transaction to the mempool

  {
    network: <Network Name String>
    transaction: <Raw Transaction Hex String>
  }

  @returns via cbk
  {
    transaction_id: <Transaction Id Hex String>
  }
*/
module.exports = ({network, transaction}, cbk) => {
  if (!network || !apis[network]) {
    return cbk([400, 'ExpectedKnownNetworkNameToSendTransactionToMempool']);
  }

  if (!transaction) {
    return cbk([400, 'ExpectedRawTransactionToPublishTransaction']);
  }

  return request({
    body: transaction,
    method: 'POST',
    url: `${apis[network]}/tx`
  },
  (err, r, transactionId) => {
    if (!!err) {
      return cbk([503, 'UnexpectedErrorPostingTransaction', err]);
    }

    if (!r || r.statusCode !== 200) {
      return cbk([503, 'UnexpectedResponsePostingTransaction']);
    }

    if (!transactionId) {
      return cbk([503, 'ExpectedTransactionIdInPostTransactionResponse']);
    }

    return cbk(null, {transaction_id: transactionId});
  });
};

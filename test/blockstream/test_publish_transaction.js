const {test} = require('tap');

const {publishTxToBlockstream} = require('./../../blockstream');

const txId = Buffer.alloc(32).toString('hex');

const tests = [
  {
    args: {},
    description: 'A network is required',
    error: [400, 'ExpectedKnownNetworkNameToSendTransactionToMempool'],
  },
  {
    args: {network: 'btc'},
    description: 'Request is required',
    error: [400, 'ExpectedRequestToPublishTransaction'],
  },
  {
    args: {network: 'btc', request: () => {}},
    description: 'Transaction is required',
    error: [400, 'ExpectedRawTransactionToPublishTransaction'],
  },
  {
    args: {network: 'btc', request: ({}, cbk) => cbk('er'), transaction: '00'},
    description: 'Error publishing transaction',
    error: [503, 'UnexpectedErrorPostingTransaction', {err: 'er'}],
  },
  {
    args: {
      network: 'btctestnet',
      request: ({url}, cbk) => {
        switch (url) {
          case 'https://blockstream.info/testnet/api/tx':
            return cbk(null, {statusCode: 503}, txId);

          default:
            return cbk(new Error('UnexpectedUrlWhenTestingPublishTx'));
        }
      },
      transaction: Buffer.alloc(100).toString('hex'),
    },
    description: 'Transaction is published',
    error: [503, 'UnexpectedResponsePostingTransaction'],
  },
  {
    args: {
      network: 'btctestnet',
      request: ({url}, cbk) => {
        switch (url) {
          case 'https://blockstream.info/testnet/api/tx':
            return cbk(null, {statusCode: 200});

          default:
            return cbk(new Error('UnexpectedUrlWhenTestingPublishTx'));
        }
      },
      transaction: Buffer.alloc(100).toString('hex'),
    },
    description: 'Transaction is published',
    error: [503, 'ExpectedTransactionIdInPostTransactionResponse'],
  },
  {
    args: {
      network: 'btctestnet',
      request: ({url}, cbk) => {
        switch (url) {
          case 'https://blockstream.info/testnet/api/tx':
            return cbk(null, {statusCode: 200}, txId);

          default:
            return cbk(new Error('UnexpectedUrlWhenTestingPublishTx'));
        }
      },
      transaction: Buffer.alloc(100).toString('hex'),
    },
    description: 'Transaction is published',
    expected: {transaction_id: txId},
  },
];

tests.forEach(({args, description, error, expected}) => {
  return test(description, ({equal, end, strictSame}) => {
    return publishTxToBlockstream(args, (err, res) => {
      if (!!err) {
        strictSame(err, error);
      } else {
        equal(err, null, 'No error publishing chain transaction');
        equal(res.transaction_id, expected.transaction_id, 'Published tx id');
      }

      return end();
    });
  });
});

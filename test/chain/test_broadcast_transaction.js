const {Transaction} = require('bitcoinjs-lib');
const {test} = require('tap');

const {broadcastTransaction} = require('./../../chain');

const txId = new Transaction().getId();

const tests = [
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
      transaction: new Transaction().toHex(),
    },
    description: 'Get chain height',
    expected: {transaction_id: txId},
  },
];

tests.forEach(({args, description, error, expected}) => {
  return test(description, ({deepIs, equal, end}) => {
    return broadcastTransaction(args, (err, res) => {
      if (!!err) {
        deepIs(err, error);
      } else {
        equal(err, null, 'No error broadcasting chain transaction');
        equal(res.transaction_id, expected.transaction_id, 'Broadcast tx id');
      }

      return end();
    });
  });
});

const {Transaction} = require('bitcoinjs-lib');
const {test} = require('@alexbosworth/tap');

const {broadcastTransaction} = require('./../../');

const txId = new Transaction().getId();

const tests = [
  {
    args: {},
    description: 'Lnd or request required to broadcast transaction',
    error: [400, 'ExpectedRequestFunctionOrLndGrpcApiObject'],
  },
  {
    args: {request: ({}, cbk) => cbk()},
    description: 'Network is required to broadcast transaction',
    error: [400, 'ExpectedNetworkToPublishTransaction'],
  },
  {
    args: {network: 'btctestnet', request: ({}, cbk) => cbk()},
    description: 'Raw transaction is required to broadcast transaction',
    error: [400, 'ExpectedValidTransactionToPublish'],
  },
  {
    args: {
      lnd: {wallet: {publishTransaction: ({}, cbk) => cbk(null, {})}},
      transaction: new Transaction().toHex(),
    },
    description: 'Transaction published to blockchain',
    expected: {transaction_id: txId},
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
      transaction: new Transaction().toHex(),
    },
    description: 'Get chain height',
    expected: {transaction_id: txId},
  },
];

tests.forEach(({args, description, error, expected}) => {
  return test(description, async ({equal, end, rejects}) => {
    if (!!error) {
      rejects(broadcastTransaction(args), error, 'Got expected error');

      return end();
    }

    const sent = await broadcastTransaction(args);

    equal(sent.transaction_id, expected.transaction_id, 'Broadcast tx id');

    return end();
  });
});

const {equal} = require('node:assert').strict;
const {rejects} = require('node:assert').strict;
const test = require('node:test');

const {idForTransaction} = require('@alexbosworth/blockchain');
const {transactionFromComponents} = require('@alexbosworth/blockchain');

const {broadcastTransaction} = require('./../../');

const emptyTx = transactionFromComponents({
  inputs: [],
  locktime: 0,
  outputs: [],
  version: 1,
}).transaction;

const txId = idForTransaction({transaction: emptyTx}).id;

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
      transaction: emptyTx,
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
      transaction: emptyTx,
    },
    description: 'Get chain height',
    expected: {transaction_id: txId},
  },
];

tests.forEach(({args, description, error, expected}) => {
  return test(description, async () => {
    if (!!error) {
      await rejects(broadcastTransaction(args), error, 'Got expected error');
    } else {
      const sent = await broadcastTransaction(args);

      equal(sent.transaction_id, expected.transaction_id, 'Broadcast tx id');
    }

    return;
  });
});

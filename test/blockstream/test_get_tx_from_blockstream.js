const {test} = require('@alexbosworth/tap');
const {Transaction} = require('bitcoinjs-lib');

const {getTxFromBlockstream} = require('./../../blockstream');

const makeRequest = ({err, tx}) => {
  return ({}, cbk) => cbk(err, null, tx || new Transaction().toHex());
};

const makeArgs = overrides => {
  const args = {
    id: 'd21633ba23f70118185227be58a63527675641ad37967e2aa461559f577aec43',
    interval: 1,
    network: 'btc',
    request: makeRequest({}),
  };

  Object.keys(overrides).forEach(k => args[k] = overrides[k]);

  return args;
};

const tests = [
  {
    args: makeArgs({id: undefined}),
    description: 'An id is expected',
    error: [400, 'ExpectedTransactionIdToGetRawTransaction'],
  },
  {
    args: makeArgs({network: undefined}),
    description: 'A network is expected',
    error: [400, 'ExpectedNetworkNameToGetRawTransaction'],
  },
  {
    args: makeArgs({network: 'network'}),
    description: 'A known network is expected',
    error: [400, 'UnsupportedNetworkToGetRawTransaction'],
  },
  {
    args: makeArgs({request: undefined}),
    description: 'A request method is expected',
    error: [400, 'ExpectedRequestMethodToGetRawTrasaction'],
  },
  {
    args: makeArgs({request: makeRequest({err: 'err'})}),
    description: 'Errors are passed back',
    error: [503, 'FailedToGetRawTransaction', {err: 'err'}],
  },
  {
    args: makeArgs({request: makeRequest({tx: 'invalid_tx'})}),
    description: 'A hex transaction is expected',
    error: [503, 'ExpectedTransactionInResponse'],
  },
  {
    args: makeArgs({
      interval: undefined,
      request: makeRequest({tx: '00'}),
      retries: 2,
    }),
    description: 'A valid transaction is expected',
    error: [503, 'ExpectedValidTransactionInResponse'],
  },
  {
    args: makeArgs({}),
    description: 'Got raw transaction',
    expected: {transaction: '01000000000000000000'},
  },
  {
    args: makeArgs({interval: undefined}),
    description: 'Got raw transaction with no retry interval',
    expected: {transaction: '01000000000000000000'},
  },
];

tests.forEach(({args, description, error, expected}) => {
  return test(description, async ({end, equal, rejects}) => {
    if (!!error) {
      await rejects(getTxFromBlockstream(args), error, 'Got expected error');
    } else {
      const {transaction} = await getTxFromBlockstream(args);

      equal(transaction, expected.transaction, 'Got expected transaction');
    }

    return end();
  });
});

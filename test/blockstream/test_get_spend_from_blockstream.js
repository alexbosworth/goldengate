const {deepEqual} = require('node:assert').strict;
const {rejects} = require('node:assert').strict;
const test = require('node:test');

const {getSpendFromBlockstream} = require('./../../blockstream');

const emptyTx = '01000000000000000000';
const spendTxId = Buffer.alloc(32, 1).toString('hex');
const txId = Buffer.alloc(32).toString('hex');

const makeRequest = ({err, response, transaction}) => {
  return ({url}, cbk) => {
    switch (url) {
      case `https://blockstream.info/api/tx/${txId}/outspend/0`:
        return cbk(null, {statusCode: 200}, {
          spent: true,
          status: {confirmed: true},
          txid: spendTxId,
        });

      case `https://blockstream.info/api/tx/${spendTxId}/hex`:
        return cbk(err, response, transaction);

      default:
        return cbk(new Error('UnexpectedUrlWhenTestingGetSpend'));
    }
  };
};

const makeArgs = overrides => {
  const args = {
    network: 'btc',
    request: makeRequest({response: {statusCode: 200}, transaction: emptyTx}),
    transaction_id: txId,
    transaction_vout: 0,
  };

  Object.keys(overrides).forEach(k => args[k] = overrides[k]);

  return args;
};

const tests = [
  {
    args: makeArgs({network: undefined}),
    description: 'A network name is expected',
    error: [400, 'ExpectedKnownNetworkNameToGetSpend'],
  },
  {
    args: makeArgs({network: 'network'}),
    description: 'A known network name is expected',
    error: [400, 'ExpectedKnownNetworkNameToGetSpend'],
  },
  {
    args: makeArgs({request: undefined}),
    description: 'A request function is expected',
    error: [400, 'ExpectedRequestFunctionToGetSpend'],
  },
  {
    args: makeArgs({transaction_id: undefined}),
    description: 'A transaction id is expected',
    error: [400, 'ExpectedTransactionIdToGetSpend'],
  },
  {
    args: makeArgs({transaction_vout: undefined}),
    description: 'A transaction output index is expected',
    error: [400, 'ExpectedTransactionOutputIndexToGetSpend'],
  },
  {
    args: makeArgs({request: ({}, cbk) => cbk('err')}),
    description: 'Spend lookup errors are passed back',
    error: [503, 'UnexpectedErrorGettingSpend', {err: 'err'}],
  },
  {
    args: makeArgs({request: ({}, cbk) => cbk()}),
    description: 'A spend lookup response is expected',
    error: [503, 'UnexpectedEmptyResponseGettingSpend'],
  },
  {
    args: makeArgs({request: ({}, cbk) => cbk(null, {})}),
    description: 'An ok spend lookup status is expected',
    error: [503, 'UnexpectedStatusCodeGettingSpend'],
  },
  {
    args: makeArgs({request: ({}, cbk) => cbk(null, {statusCode: 200})}),
    description: 'Spend data is expected',
    error: [503, 'ExpectedResponseForSpendDataQuery'],
  },
  {
    args: makeArgs({
      request: ({}, cbk) => cbk(null, {statusCode: 200}, {spent: false}),
    }),
    description: 'Nothing is returned when the output is unspent',
    expected: {},
  },
  {
    args: makeArgs({request: ({}, cbk) => cbk(null, {statusCode: 200}, {})}),
    description: 'A spent status is expected',
    error: [503, 'ExpectedSpendStatusInSpendDataQuery'],
  },
  {
    args: makeArgs({
      request: ({}, cbk) => cbk(null, {statusCode: 200}, {spent: true}),
    }),
    description: 'A spending transaction status is expected',
    error: [503, 'ExpectedSpendTransactionStatusInSpendResult'],
  },
  {
    args: makeArgs({
      request: ({}, cbk) => {
        return cbk(null, {statusCode: 200}, {spent: true, status: {}});
      },
    }),
    description: 'Nothing is returned when the spend is unconfirmed',
    expected: {},
  },
  {
    args: makeArgs({
      request: ({}, cbk) => {
        return cbk(null, {statusCode: 200}, {
          spent: true,
          status: {confirmed: true},
        });
      },
    }),
    description: 'A spending transaction id is expected',
    error: [503, 'ExpectedTransactionIdOfSpendInResponse'],
  },
  {
    args: makeArgs({request: makeRequest({err: 'err'})}),
    description: 'Spending transaction lookup errors are passed back',
    error: [503, 'UnexpectedErrorGettingSpend', {err: 'err'}],
  },
  {
    args: makeArgs({request: makeRequest({})}),
    description: 'A spending transaction lookup response is expected',
    error: [503, 'UnexpectedEmptyResponseGettingSpend'],
  },
  {
    args: makeArgs({request: makeRequest({response: {}})}),
    description: 'An ok spending transaction lookup status is expected',
    error: [503, 'UnexpectedStatusCodeGettingSpend'],
  },
  {
    args: makeArgs({request: makeRequest({response: {statusCode: 200}})}),
    description: 'A raw spending transaction is expected',
    error: [503, 'ExpectedRawHexTransactionForTxLookup'],
  },
  {
    args: makeArgs({
      request: makeRequest({response: {statusCode: 200}, transaction: '00'}),
    }),
    description: 'A valid raw spending transaction is expected',
    error: [503, 'ExpectedRawTransactionInSpendResponse'],
  },
  {
    args: makeArgs({}),
    description: 'Get the spending transaction',
    expected: {transaction: emptyTx},
  },
];

tests.forEach(({args, description, error, expected}) => {
  return test(description, async () => {
    if (!!error) {
      await rejects(getSpendFromBlockstream(args), error, 'Got error');
    } else {
      const res = await getSpendFromBlockstream(args);

      deepEqual(res, expected, 'Got expected result');
    }

    return;
  });
});

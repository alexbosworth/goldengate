const {rejects} = require('node:assert').strict;
const test = require('node:test');

const dir = './../../transactions';

const makeRefundTransaction = require(`${dir}/make_refund_transaction`);

const tests = [
  {
    args: {},
    description: 'Height is required',
    error: [
      500,
      'FailedToConstructRefundTransaction',
      {err: new Error('ExpectedLocktimeHeightForRefundTransaction')},
    ],
  },
];

tests.forEach(({args, description, error, expected}) => {
  return test(description, async () => {
    if (!!error) {
      await rejects(makeRefundTransaction(args), error, 'Got expected error');
    } else {
      await makeRefundTransaction(args);
    }

    return;
  });
});

const {test} = require('@alexbosworth/tap');

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
  return test(description, async ({equal, end, rejects}) => {
    if (!!error) {
      rejects(makeRefundTransaction(args), error, 'Got expected error');
    } else {
      await makeRefundTransaction(args);
    }

    return end();
  });
});

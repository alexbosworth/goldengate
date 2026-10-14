const {deepEqual} = require('node:assert').strict;
const test = require('node:test');

const {genericSwapAuth} = require('./../../');

const tests = [
  {
    args: {},
    description: 'An empty authorization is specified without a macaroon',
    expected: {authorization: [String()]},
  },
  {
    args: {macaroon: 'macaroon', preimage: 'preimage'},
    description: 'A macaroon and preimage are specified as authorization',
    expected: {authorization: ['LSAT macaroon:preimage']},
  },
];

tests.forEach(({args, description, expected}) => {
  return test(description, (t, end) => {
    const {metadata} = genericSwapAuth(args);

    const authorization = metadata.get('Authorization');

    deepEqual(authorization, expected.authorization, 'Got authorization');

    return end();
  });
});

const {deepEqual} = require('node:assert').strict;
const test = require('node:test');

const {lightningLabsSwapAuth} = require('./../../');

const tests = [
  {
    args: {},
    description: 'No authorization is specified without a macaroon',
    expected: {authorization: []},
  },
  {
    args: {macaroon: 'macaroon', preimage: 'preimage'},
    description: 'A macaroon and preimage are specified as authorization',
    expected: {authorization: ['LSAT macaroon:preimage']},
  },
];

tests.forEach(({args, description, expected}) => {
  return test(description, (t, end) => {
    const {metadata} = lightningLabsSwapAuth(args);

    const authorization = metadata.get('Authorization');

    deepEqual(authorization, expected.authorization, 'Got authorization');

    return end();
  });
});

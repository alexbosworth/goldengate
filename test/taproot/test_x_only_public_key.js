const {deepEqual} = require('node:assert').strict;
const test = require('node:test');

const method = require('./../../taproot/x_only_public_key');

const xOnlyKey = '50929b74c1a04954b78b4b6035e97a5e078a5a0f28ec96d547bfee9ace803ac0';

const tests = [
  {
    args: {},
    description: 'No key gives no x-only key',
    expected: {x_only: undefined},
  },
  {
    args: {public_key: xOnlyKey},
    description: 'An x-only key is returned as is',
    expected: {x_only: xOnlyKey},
  },
  {
    args: {public_key: `02${xOnlyKey}`},
    description: 'An even compressed key loses its parity byte',
    expected: {x_only: xOnlyKey},
  },
  {
    args: {public_key: `03${xOnlyKey}`},
    description: 'An odd compressed key loses its parity byte',
    expected: {x_only: xOnlyKey},
  },
];

tests.forEach(({args, description, expected}) => {
  return test(description, (t, end) => {
    deepEqual(method(args), expected, 'Got expected x-only key');

    return end();
  });
});

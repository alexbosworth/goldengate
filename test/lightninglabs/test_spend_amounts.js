const {deepEqual} = require('node:assert').strict;
const test = require('node:test');

const method = require('./../../lightninglabs/spend_amounts');

const tests = [
  {
    args: {fee: 100, fee_with_change: 150, total: 10000},
    description: 'Without tokens everything less the fee is spent',
    expected: {change: 0, spend: 9900},
  },
  {
    args: {fee: 100, fee_with_change: 150, tokens: 5000, total: 10000},
    description: 'Excess tokens come back as change',
    expected: {change: 4850, spend: 5000},
  },
  {
    args: {fee: 100, fee_with_change: 150, tokens: 9600, total: 10000},
    description: 'Excess tokens that would be dust change go to miners',
    expected: {change: 0, spend: 9600},
  },
  {
    args: {fee: 100, fee_with_change: 150, tokens: 9950, total: 10000},
    description: 'Utxos that cannot pay for the tokens have no amounts',
    expected: {},
  },
];

tests.forEach(({args, description, expected}) => {
  return test(description, (t, end) => {
    deepEqual(method(args), expected, 'Got expected amounts');

    return end();
  });
});

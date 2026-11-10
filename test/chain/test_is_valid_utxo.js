const {equal} = require('node:assert').strict;
const test = require('node:test');

const isValidUtxo = require('./../../chain/is_valid_utxo');

const id = Buffer.alloc(32, 1).toString('hex');

const makeUtxo = overrides => ({
  confirmation_height: 100,
  tokens: 1,
  transaction_id: id,
  transaction_vout: 0,
  ...overrides,
});

const tests = [
  {
    args: makeUtxo({}),
    description: 'A confirmed utxo is valid',
    expected: true,
  },
  {
    args: makeUtxo({confirmation_height: undefined}),
    description: 'An unconfirmed utxo is valid',
    expected: true,
  },
  {
    args: makeUtxo({confirmation_height: 0, transaction_vout: 4294967295}),
    description: 'Zero heights and the last output index are valid',
    expected: true,
  },
  {
    args: makeUtxo({transaction_id: id.toUpperCase()}),
    description: 'An uppercase transaction id is valid',
    expected: true,
  },
  {args: null, description: 'A utxo is expected', expected: false},
  {
    args: makeUtxo({transaction_id: id.slice(2)}),
    description: 'A transaction id is expected',
    expected: false,
  },
  {
    args: makeUtxo({transaction_vout: -1}),
    description: 'A non-negative output index is expected',
    expected: false,
  },
  {
    args: makeUtxo({transaction_vout: 4294967296}),
    description: 'An output index in range is expected',
    expected: false,
  },
  {
    args: makeUtxo({transaction_vout: 0.5}),
    description: 'An integer output index is expected',
    expected: false,
  },
  {
    args: makeUtxo({tokens: 0}),
    description: 'Tokens are expected',
    expected: false,
  },
  {
    args: makeUtxo({tokens: '1'}),
    description: 'Tokens are expected to be a number',
    expected: false,
  },
  {
    args: makeUtxo({confirmation_height: -1}),
    description: 'A non-negative confirmation height is expected',
    expected: false,
  },
  {
    args: makeUtxo({confirmation_height: null}),
    description: 'A numeric confirmation height is expected',
    expected: false,
  },
];

tests.forEach(({args, description, expected}) => {
  return test(description, () => {
    equal(isValidUtxo(args), expected, 'Got validity');

    return;
  });
});

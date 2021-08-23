const {test} = require('@alexbosworth/tap');

const method = require('./../../funding/is_bech32_encoded');

const tests = [
  {
    args: {
      input: 'tb1qzmswhxxwxvhat6ke3wu27gqqxn4qxqn6qwarwkz6lmky3l3jqjfqy5wl9x',
    },
    description: 'A bech32 address is bech32 encoded',
    expected: {is_bech32: true},
  },
  {
    args: {input: 'invalid bech32 input'},
    description: 'Non bech32 content is not bech32 encoded',
    expected: {is_bech32: false},
  },
];

tests.forEach(({args, description, error, expected}) => {
  return test(description, ({end, strictSame, throws}) => {
    if (!!error) {
      throws(() => method(args), new Error(error), 'Error returned');

      return end();
    } else {
      const got = method(args);

      strictSame(got, expected, 'Got expected result');
    }

    return end();
  });
});

const {test} = require('@alexbosworth/tap');

const method = require('./../../funding/address_data_from_bech32');

const tests = [
  {
    args: {address: 'BC1QW508D6QEJXTDG4Y5R3ZARVARY0C5XW7KV8F3T4'},
    description: 'Got address data.',
    expected: {data: '751e76e8199196d454941c45d1b3a323f1433bd6', version: 0},
  },
  {
    args: {address: 'abcdef1l7aum6echk45nj3s0wdvt2fg8x9yrzpqzd3ryx'},
    description: 'Got bech32m address data.',
    expected: {data: 'f779bd6717b56939460f7358b5250731483104', version: 31},
  },
];

tests.forEach(({args, description, error, expected}) => {
  return test(description, ({end, strictSame, throws}) => {
    if (!!error) {
      throws(() => method(args), new Error(error), 'Error returned');

      return end();
    } else {
      const got = method(args);

      got.data = got.data.toString('hex');

      strictSame(got, expected, 'Got expected result');
    }

    return end();
  });
});

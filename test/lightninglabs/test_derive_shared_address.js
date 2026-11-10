const {deepEqual} = require('node:assert').strict;
const test = require('node:test');

const method = require('./../../lightninglabs/derive_shared_address');

const address = 'bc1pj6mhp4mr6nzg85l8lwvrs8n850c76n9ykvnryu2q4zgtyzlly2js2papaf';
const clientKey = '031b84c5567b126440995d3ed5aaba0565d71e1834604819ff9c17f5e9d5dd078f';
const serverKey = '024d4b6cd1361032ca9bd2aeb9d900aa4d45d9ead80ac9423374c451a7254d0766';

const makeArgs = overrides => {
  const args = {
    client_public_key: clientKey,
    expiry: 14400,
    network: 'btc',
    server_public_key: serverKey,
  };

  Object.keys(overrides).forEach(k => args[k] = overrides[k]);

  return args;
};

const tests = [
  {
    args: makeArgs({network: 'network'}),
    description: 'An unknown network is an error',
    expected: {err: 'ExpectedKnownNetworkForSharedAddressScript'},
  },
  {
    args: makeArgs({server_public_key: '00'}),
    description: 'An invalid server key is an error',
    expected: {err: 'ExpectedServerPublicKeyForSharedAddressScript'},
  },
  {
    args: makeArgs({}),
    description: 'Derive a shared address',
    expected: {address},
  },
];

tests.forEach(({args, description, expected}) => {
  return test(description, (t, end) => {
    const res = method(args);

    if (!!expected.err) {
      deepEqual(res.err.message, expected.err, 'Got expected error');
    } else {
      deepEqual(res, expected, 'Got expected result');
    }

    return end();
  });
});

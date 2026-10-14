const {equal} = require('node:assert').strict;
const test = require('node:test');
const {throws} = require('node:assert').strict;

const {getPublicKey} = require('./../../script');

const tests = [
  {
    args: {
      private_key: 'fc2d30c764199da720f98842fd3e76ca01cbca3dda854b1852239cc45a92b3d1',
    },
    description: 'Public key derived for private key',
    expected: {
      public_key: '0366d6a3884e943c40a10c85220753548fb7e15dd20752f6fa026d5dd5737f4a5a',
    },
  },
  {
    args: {
      private_key: '2222222222222222222222222222222222222222222222222222222222222222',
    },
    description: 'An even public key is derived for a private key',
    expected: {
      public_key: '02466d7fcae563e5cb09a0d1870bb580344804617879a14949cf22285f1bae3f27',
    },
  },
  {
    args: {},
    description: 'Deriving public key requires public key',
    error: 'ExpectedPrivateKeyToDerivePublicKey',
  },
  {
    args: {private_key: Buffer.alloc(32).toString('hex')},
    description: 'Deriving public key requires a valid private key',
    error: 'ExpectedValidPrivateKeyToDerivePublicKey',
  },
];

tests.forEach(({args, description, error, expected}) => {
  return test(description, async () => {
    if (!!error) {
      throws(() => getPublicKey(args), new Error(error), 'Got error');
    } else {
      const pair = getPublicKey(args);

      equal(pair.public_key, expected.public_key, 'Public key as expected');
    }

    return;
  });
});

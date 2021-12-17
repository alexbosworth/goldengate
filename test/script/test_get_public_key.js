const {ECPair} = require('ecpair');
const {test} = require('@alexbosworth/tap');
const tinysecp = require('tiny-secp256k1');

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
    args: {},
    description: 'Deriving public key requires public key',
    error: 'ExpectedPrivateKey',
  },
];

tests.forEach(({args, description, error, expected}) => {
  return test(description, async ({end, equal, throws}) => {
    args.ecp = (await import('ecpair')).ECPairFactory(tinysecp);

    if (!!error) {
      throws(() => getPublicKey(args), new Error(error), 'Got error');

      return end();
    }

    const pair = getPublicKey(args);

    equal(pair.public_key, expected.public_key, 'Public key as expected');

    return end();
  });
});

const {equal} = require('node:assert').strict;
const {notEqual} = require('node:assert').strict;
const test = require('node:test');

const {isPrivate} = require('tiny-secp256k1');

const {getPublicKey} = require('./../../script');
const {makePrivateKey} = require('./../../script');

const tests = [
  {
    args: {},
    description: 'A random valid private key is made',
  },
];

tests.forEach(({args, description}) => {
  return test(description, (t, end) => {
    const key = makePrivateKey(args);
    const otherKey = makePrivateKey(args);

    equal(/^[0-9a-f]{64}$/.test(key.private_key), true, 'Got hex private key');
    equal(isPrivate(Buffer.from(key.private_key, 'hex')), true, 'Valid key');
    notEqual(key.private_key, otherKey.private_key, 'Private key is random');

    const {public_key} = getPublicKey({private_key: key.private_key});

    equal(public_key.length, 66, 'Public key is derived from private key');

    return end();
  });
});

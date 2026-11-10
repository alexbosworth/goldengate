const {equal} = require('node:assert').strict;
const test = require('node:test');

const method = require('./../../lightninglabs/is_valid_refund_signature');

const hash = '6e340b9cffb37a989ca544e6bb780a2c78901d3fb33738768511a30617afa01d';
const key = '1b84c5567b126440995d3ed5aaba0565d71e1834604819ff9c17f5e9d5dd078f';
const malformed = Buffer.alloc(64, 255).toString('hex');
const signature = '577aff0f30416bcb597f1804e82dbea73627a40b4bfab7b9c5c7df1c28282c954dc114b1ffc59095299336afc1244fca894b89020d872126a8cd3ef7ec7b9a96';
const unrelated = Buffer.alloc(64, 1).toString('hex');

// The signature is a BIP 340 signature of the hash by private key 0x0101..01
const tests = [
  {
    args: {hash, key, signature},
    description: 'A valid signature is valid',
    expected: true,
  },
  {
    args: {hash, key, signature: `${signature}01`},
    description: 'A signature with a sighash flag is not valid',
    expected: false,
  },
  {
    args: {hash, key, signature: unrelated},
    description: 'A signature that does not verify is not valid',
    expected: false,
  },
  {
    args: {hash, key, signature: malformed},
    description: 'A malformed signature is not valid',
    expected: false,
  },
];

tests.forEach(({args, description, expected}) => {
  return test(description, () => {
    equal(method(args), expected, 'Got expected validity');

    return;
  });
});

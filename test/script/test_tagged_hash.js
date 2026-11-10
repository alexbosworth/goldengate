const {equal} = require('node:assert').strict;
const test = require('node:test');

const method = require('./../../script/tagged_hash');

// Expected hashes computed independently with Python hashlib
const tests = [
  {
    args: {message: Buffer.alloc(0), tag: 'KeyAgg list'},
    description: 'Tagged hash of an empty message',
    expected: '634f77a422b6a39257a76f2c13ae017702bacd4c49b33dad1139cdd56060d360',
  },
  {
    args: {message: Buffer.from('00', 'hex'), tag: 'BIP0340/challenge'},
    description: 'Tagged hash of a message',
    expected: '9dfac9bafe7227e8ee4096f9f527a2aecd14dcb196c55b23e981becca1e22d40',
  },
];

tests.forEach(({args, description, expected}) => {
  return test(description, (t, end) => {
    equal(method(args).toString('hex'), expected, 'Got expected hash');

    return end();
  });
});

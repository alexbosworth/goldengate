const {equal} = require('node:assert').strict;
const test = require('node:test');

const method = require('./../../transactions/encode_der_integer');

const hexAsBuffer = hex => Buffer.from(hex, 'hex');

const tests = [
  {
    args: {bytes: hexAsBuffer('7f01')},
    description: 'A minimal positive value is unchanged',
    expected: '7f01',
  },
  {
    args: {bytes: hexAsBuffer('00007f01')},
    description: 'Leading zero bytes are removed',
    expected: '7f01',
  },
  {
    args: {bytes: hexAsBuffer('80')},
    description: 'A value with the high bit set gets a leading zero',
    expected: '0080',
  },
  {
    args: {bytes: hexAsBuffer('000080')},
    description: 'Leading zeros are removed before a high bit is padded',
    expected: '0080',
  },
  {
    args: {bytes: hexAsBuffer('0000')},
    description: 'A zero value is encoded as a single zero byte',
    expected: '00',
  },
];

tests.forEach(({args, description, expected}) => {
  return test(description, (t, end) => {
    const {encoded} = method(args);

    equal(encoded.toString('hex'), expected, 'Got expected DER integer');

    return end();
  });
});

const {deepEqual} = require('node:assert').strict;
const test = require('node:test');

const {OP_0} = require('bitcoin-ops');
const {OP_1} = require('bitcoin-ops');
const {OP_16} = require('bitcoin-ops');
const {OP_1NEGATE} = require('bitcoin-ops');
const {OP_CHECKSIG} = require('bitcoin-ops');

const method = require('./../../script/minimal_script_element');

const tests = [
  {
    args: {element: OP_CHECKSIG},
    description: 'An op code is already minimal',
    expected: {element: OP_CHECKSIG},
  },
  {
    args: {element: Buffer.alloc(0)},
    description: 'An empty push is OP_0',
    expected: {element: OP_0},
  },
  {
    args: {element: Buffer.from([1])},
    description: 'A push of 1 is OP_1',
    expected: {element: OP_1},
  },
  {
    args: {element: Buffer.from([16])},
    description: 'A push of 16 is OP_16',
    expected: {element: OP_16},
  },
  {
    args: {element: Buffer.from([0x81])},
    description: 'A push of -1 is OP_1NEGATE',
    expected: {element: OP_1NEGATE},
  },
  {
    args: {element: Buffer.from([0])},
    description: 'A push of a zero byte is a data push',
    expected: {element: Buffer.from([0])},
  },
  {
    args: {element: Buffer.from([17])},
    description: 'A push of 17 is a data push',
    expected: {element: Buffer.from([17])},
  },
  {
    args: {element: Buffer.from([1, 2])},
    description: 'A push of more than a byte is a data push',
    expected: {element: Buffer.from([1, 2])},
  },
];

tests.forEach(({args, description, expected}) => {
  return test(description, (t, end) => {
    deepEqual(method(args), expected, 'Got expected element');

    return end();
  });
});

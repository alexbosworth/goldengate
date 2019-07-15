const {address} = require('bitcoinjs-lib');
const {networks} = require('bitcoinjs-lib');
const {test} = require('tap');
const {Transaction} = require('bitcoinjs-lib');

const findOutput = require('./../../chain/find_output');

const addr = '2NEfsR6yeuF8tusetj5jhPz7LizY7frRfqu';
const addr2 = '2NDhzMt2D9ZxXapbuq567WGeWP7NuDN81cg';
const {toOutputScript} = address;
const tokens = 1000;
const tx1 = new Transaction();
const tx2 = new Transaction();
const vout = 0;

tx2.addInput(Buffer.from(tx1.getId(), 'hex').reverse(), vout);
tx2.addOutput(toOutputScript(addr, networks.testnet), tokens);

const tests = [
  {
    args: {
      script: toOutputScript(addr, networks.testnet).toString('hex'),
      transaction: tx2.toHex(),
    },
    description: 'Find output',
    expected: {tokens, vout, id: tx2.getId()},
  },
  {
    args: {
      script: toOutputScript(addr2, networks.testnet).toString('hex'),
      transaction: tx2.toHex(),
    },
    description: 'Ignore output when script is wrong',
    expected: {},
  },
  {
    args: {
      vout,
      id: tx1.getId(),
      script: toOutputScript(addr, networks.testnet).toString('hex'),
      transaction: tx2.toHex(),
    },
    description: 'Find output when outpoint is specified',
    expected: {tokens, vout, id: tx2.getId()},
  },
  {
    args: {
      vout: 1,
      id: tx1.getId(),
      script: toOutputScript(addr, networks.testnet).toString('hex'),
      transaction: tx2.toHex(),
    },
    description: 'Find output when different outpoint is specified',
    expected: {},
  },
  {
    args: {
      vout,
      id: tx2.getId(),
      script: toOutputScript(addr, networks.testnet).toString('hex'),
      transaction: tx2.toHex(),
    },
    description: 'Find output when different txid is specified',
    expected: {},
  },
  {
    args: {
      tokens,
      vout,
      id: tx1.getId(),
      script: toOutputScript(addr, networks.testnet).toString('hex'),
      transaction: tx2.toHex(),
    },
    description: 'Find output when outpoint and tokens are specified',
    expected: {tokens, vout, id: tx2.getId()},
  },
  {
    args: {
      vout,
      id: tx1.getId(),
      script: toOutputScript(addr, networks.testnet).toString('hex'),
      tokens: tokens + 100,
      transaction: tx2.toHex(),
    },
    description: 'Avoid output when outpoint and wrong tokens are specified',
    expected: {},
  },
];

tests.forEach(({args, description, error, expected}) => {
  return test(description, ({end, equal, throws}) => {
    if (!!error) {
      throws(() => findOutput(args), new Error(error));

      return end();
    }

    const output = findOutput(args).output || {};

    equal(output.id, expected.id, 'Outpoint id is returned');
    equal(output.tokens, expected.tokens, 'Output tokens is returned');
    equal(output.vout, expected.vout, 'Outpoint vout is returned');

    return end();
  });
});

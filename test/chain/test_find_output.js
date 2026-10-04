const {equal} = require('node:assert').strict;
const test = require('node:test');
const {throws} = require('node:assert').strict;

const {idForTransaction} = require('@alexbosworth/blockchain');
const {outputScriptForAddress} = require('@alexbosworth/blockchain');
const {transactionFromComponents} = require('@alexbosworth/blockchain');

const findOutput = require('./../../chain/find_output');

const addr = '2NEfsR6yeuF8tusetj5jhPz7LizY7frRfqu';
const addr2 = '2NDhzMt2D9ZxXapbuq567WGeWP7NuDN81cg';
const maxSequence = 0xffffffff;
const network = 'btctestnet';
const outputScript = address => outputScriptForAddress({address, network});
const tokens = 1000;
const vout = 0;

const tx1 = transactionFromComponents({
  inputs: [],
  locktime: 0,
  outputs: [],
  version: 1,
}).transaction;

const tx1Id = idForTransaction({transaction: tx1}).id;

const tx2 = transactionFromComponents({
  inputs: [{vout, id: tx1Id, script: String(), sequence: maxSequence}],
  locktime: 0,
  outputs: [{tokens, script: outputScript(addr).script}],
  version: 1,
}).transaction;

const tx2Id = idForTransaction({transaction: tx2}).id;

const tests = [
  {
    args: {
      script: outputScript(addr).script,
      transaction: tx2,
    },
    description: 'Find output',
    expected: {tokens, vout, id: tx2Id},
  },
  {
    args: {
      script: outputScript(addr2).script,
      transaction: tx2,
    },
    description: 'Ignore output when script is wrong',
    expected: {},
  },
  {
    args: {
      vout,
      id: tx1Id,
      script: outputScript(addr).script,
      transaction: tx2,
    },
    description: 'Find output when outpoint is specified',
    expected: {tokens, vout, id: tx2Id},
  },
  {
    args: {
      vout: 1,
      id: tx1Id,
      script: outputScript(addr).script,
      transaction: tx2,
    },
    description: 'Find output when different outpoint is specified',
    expected: {},
  },
  {
    args: {
      vout,
      id: tx2Id,
      script: outputScript(addr).script,
      transaction: tx2,
    },
    description: 'Find output when different txid is specified',
    expected: {},
  },
  {
    args: {
      tokens,
      vout,
      id: tx1Id,
      script: outputScript(addr).script,
      transaction: tx2,
    },
    description: 'Find output when outpoint and tokens are specified',
    expected: {tokens, vout, id: tx2Id},
  },
  {
    args: {
      vout,
      id: tx1Id,
      script: outputScript(addr).script,
      tokens: tokens + 100,
      transaction: tx2,
    },
    description: 'Avoid output when outpoint and wrong tokens are specified',
    expected: {},
  },
];

tests.forEach(({args, description, error, expected}) => {
  return test(description, (t, end) => {
    if (!!error) {
      throws(() => findOutput(args), new Error(error));
    } else {
      const output = findOutput(args).output || {};

      equal(output.id, expected.id, 'Outpoint id is returned');
      equal(output.tokens, expected.tokens, 'Output tokens is returned');
      equal(output.vout, expected.vout, 'Outpoint vout is returned');
    }

    return end();
  });
});

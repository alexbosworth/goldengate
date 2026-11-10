const {createHash} = require('node:crypto');
const {deepEqual} = require('node:assert').strict;
const test = require('node:test');

const {idForBlock} = require('@alexbosworth/blockchain');
const {idForTransaction} = require('@alexbosworth/blockchain');
const {numberAsCompactInt} = require('@alexbosworth/blockchain');

const {encodeTransaction} = require('./../../transactions');
const scanBlocks = require('./../../chain/scan_blocks_for_utxos');

const hexAsBuffer = hex => Buffer.from(hex, 'hex');
const otherScript = `0014${'22'.repeat(20)}`;
const script = `5120${'11'.repeat(32)}`;
const sha256 = n => createHash('sha256').update(n).digest('hex');
const witness = [Buffer.alloc(32, 1).toString('hex')];

// A block is a header, a count of transactions, and then the transactions
const blockOf = ({previous, time, transactions}) => {
  const header = Buffer.alloc(80);

  header.writeUInt32LE(time, 68);

  hexAsBuffer(previous).reverse().copy(header, 4);

  return Buffer.concat([
    header,
    numberAsCompactInt({number: transactions.length}).encoded,
    ...transactions.map(hexAsBuffer),
  ]).toString('hex');
};

const coinbase = encodeTransaction({
  inputs: [{
    id: Buffer.alloc(32).toString('hex'),
    script: '0101',
    sequence: 4294967295,
    vout: 4294967295,
  }],
  locktime: 0,
  outputs: [{script: otherScript, tokens: 5000000000}],
  version: 1,
}).transaction;

const funding = encodeTransaction({
  inputs: [{id: sha256('1'), script: '', sequence: 0, vout: 0, witness}],
  locktime: 0,
  outputs: [{script, tokens: 200000}],
  version: 2,
}).transaction;

const fundingId = idForTransaction({transaction: funding}).id;
const start = sha256('start');

const first = blockOf({previous: start, time: 1, transactions: [coinbase]});

const firstId = idForBlock({block: first}).id;

const second = blockOf({
  previous: firstId,
  time: 2,
  transactions: [coinbase, funding],
});

const fork = blockOf({previous: sha256('fork'), time: 2, transactions: []});
const secondId = idForBlock({block: second}).id;

const utxo = (id, height) => ({
  confirmation_height: height,
  tokens: 200000,
  transaction_id: id,
  transaction_vout: 0,
});

const makeArgs = overrides => ({
  blocks: [first, second],
  utxos: [],
  heights: [100, 101],
  id: start,
  output_script: script,
  ...overrides,
});

const tests = [
  {
    args: makeArgs({}),
    description: 'Consecutive blocks are scanned for utxos',
    expected: {utxos: [utxo(fundingId, 101)], id: secondId},
  },
  {
    args: makeArgs({id: undefined}),
    description: 'The first block can build on any block',
    expected: {utxos: [utxo(fundingId, 101)], id: secondId},
  },
  {
    args: makeArgs({utxos: [utxo(sha256('known'), 99)]}),
    description: 'Known utxos are kept when they are not spent',
    expected: {
      utxos: [utxo(sha256('known'), 99), utxo(fundingId, 101)],
      id: secondId,
    },
  },
  {
    args: makeArgs({id: sha256('other')}),
    description: 'The first block has to build on the block before',
    expected: {error: [503, 'UnexpectedReorgScanningForSharedUtxos']},
  },
  {
    args: makeArgs({blocks: [first, fork]}),
    description: 'Each block has to build on the block before it',
    expected: {error: [503, 'UnexpectedReorgScanningForSharedUtxos']},
  },
  {
    args: makeArgs({blocks: [`${first}00`, second]}),
    description: 'A block that cannot be scanned is an error',
    expected: {
      error: [
        503,
        'FailedToScanBlockForSharedUtxos',
        {err: new Error('UnexpectedDataAfterBlockTransactions')},
      ],
    },
  },
];

tests.forEach(({args, description, expected}) => {
  return test(description, () => {
    deepEqual(scanBlocks(args), expected, 'Got scan result');

    return;
  });
});

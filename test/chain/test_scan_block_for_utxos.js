const {createHash} = require('node:crypto');
const {deepEqual} = require('node:assert').strict;
const test = require('node:test');
const {throws} = require('node:assert').strict;

const {idForTransaction} = require('@alexbosworth/blockchain');
const {numberAsCompactInt} = require('@alexbosworth/blockchain');

const {encodeTransaction} = require('./../../transactions');
const scanBlockForUtxos = require('./../../chain/scan_block_for_utxos');

const hexAsBuffer = hex => Buffer.from(hex, 'hex');
const otherScript = `0014${'22'.repeat(20)}`;
const script = `5120${'11'.repeat(32)}`;
const sha256 = n => createHash('sha256').update(n).digest('hex');
const witness = [Buffer.alloc(32, 1).toString('hex')];

// A block is a header, a count of transactions, and then the transactions
const blockOf = transactions => Buffer.concat([
  Buffer.alloc(80),
  numberAsCompactInt({number: transactions.length}).encoded,
  ...transactions.map(hexAsBuffer),
]).toString('hex');

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

// A SegWit transaction paying two utxos
const funding = encodeTransaction({
  inputs: [{id: sha256('1'), script: '', sequence: 0, vout: 0, witness}],
  locktime: 0,
  outputs: [
    {script, tokens: 200000},
    {script: otherScript, tokens: 1000},
    {script, tokens: 100000},
  ],
  version: 2,
}).transaction;

// A legacy transaction paying one utxo
const legacy = encodeTransaction({
  inputs: [{id: sha256('2'), script: '00', sequence: 0, vout: 1}],
  locktime: 0,
  outputs: [{script, tokens: 50000}],
  version: 2,
}).transaction;

// A transaction with enough outputs to need a multi-byte outputs count
const fanOut = encodeTransaction({
  inputs: [{id: sha256('3'), script: '', sequence: 0, vout: 0, witness}],
  locktime: 0,
  outputs: Array.from({length: 253}, (_, i) => ({
    script: i === 252 ? script : otherScript,
    tokens: 1000 + i,
  })),
  version: 2,
}).transaction;

// A transaction paying nothing to the output script
const zeroValue = encodeTransaction({
  inputs: [{id: sha256('4'), script: '', sequence: 0, vout: 0, witness}],
  locktime: 0,
  outputs: [{script, tokens: 0}, {script, tokens: 1}],
  version: 2,
}).transaction;

const fanOutId = idForTransaction({transaction: fanOut}).id;
const fundingId = idForTransaction({transaction: funding}).id;
const legacyId = idForTransaction({transaction: legacy}).id;
const zeroValueId = idForTransaction({transaction: zeroValue}).id;

// Spend the first funding utxo and pay change back to the output script
const spend = encodeTransaction({
  inputs: [{id: fundingId, script: '', sequence: 0, vout: 0, witness}],
  locktime: 0,
  outputs: [{script: otherScript, tokens: 150000}, {script, tokens: 49000}],
  version: 2,
}).transaction;

const spendId = idForTransaction({transaction: spend}).id;

const known = {
  confirmation_height: 10,
  tokens: 300000,
  transaction_id: sha256('known'),
  transaction_vout: 0,
};

// Spend the known utxo
const spendKnown = encodeTransaction({
  inputs: [{
    id: known.transaction_id,
    script: '',
    sequence: 0,
    vout: known.transaction_vout,
    witness,
  }],
  locktime: 0,
  outputs: [{script: otherScript, tokens: 299000}],
  version: 2,
}).transaction;

const uppercaseKnown = {
  ...known,
  transaction_id: known.transaction_id.toUpperCase(),
};

const utxo = (id, vout, tokens) => ({
  tokens,
  confirmation_height: 100,
  transaction_id: id,
  transaction_vout: vout,
});

const tests = [
  {
    args: {
      block: blockOf([coinbase, funding, legacy]),
      utxos: [known],
      height: 100,
      output_script: script,
    },
    description: 'Outputs paying to the output script are utxos',
    expected: {
      utxos: [
        known,
        utxo(fundingId, 0, 200000),
        utxo(fundingId, 2, 100000),
        utxo(legacyId, 0, 50000),
      ],
    },
  },
  {
    args: {
      block: blockOf([coinbase, spendKnown]),
      utxos: [known, utxo(fundingId, 2, 100000)],
      height: 101,
      output_script: script,
    },
    description: 'A spent utxo is no longer a utxo',
    expected: {utxos: [utxo(fundingId, 2, 100000)]},
  },
  {
    args: {
      block: blockOf([coinbase, funding, spend]),
      utxos: [],
      height: 100,
      output_script: script,
    },
    description: 'A utxo can be spent in the block it is made in',
    expected: {
      utxos: [
        utxo(fundingId, 2, 100000),
        utxo(spendId, 1, 49000),
      ],
    },
  },
  {
    args: {
      block: blockOf([coinbase]),
      utxos: [uppercaseKnown],
      height: 100,
      output_script: script,
    },
    description: 'Known utxos are kept when they are not spent',
    expected: {utxos: [uppercaseKnown]},
  },
  {
    args: {
      block: blockOf([coinbase, spendKnown]),
      utxos: [uppercaseKnown],
      height: 100,
      output_script: script,
    },
    description: 'Known utxo transaction ids can be uppercase hex',
    expected: {utxos: []},
  },
  {
    args: {
      block: blockOf([coinbase, fanOut]),
      utxos: [],
      height: 100,
      output_script: script,
    },
    description: 'Outputs counts can need more than one byte',
    expected: {utxos: [utxo(fanOutId, 252, 1252)]},
  },
  {
    args: {
      block: blockOf([coinbase, zeroValue]),
      utxos: [],
      height: 100,
      output_script: script,
    },
    description: 'Outputs without value are not utxos',
    expected: {utxos: [utxo(zeroValueId, 1, 1)]},
  },
  {
    args: {
      block: `${blockOf([coinbase])}00`,
      utxos: [],
      height: 100,
      output_script: script,
    },
    description: 'A block cannot have data after the transactions',
    error: 'UnexpectedDataAfterBlockTransactions',
  },
  {
    args: {
      block: blockOf([coinbase, funding]).slice(0, -20),
      utxos: [],
      height: 100,
      output_script: script,
    },
    description: 'A block cannot be cut short',
    error: 'UnexpectedEndOfBlockData',
  },
  {
    args: {
      block: blockOf([coinbase, funding]).slice(0, -2),
      utxos: [],
      height: 100,
      output_script: script,
    },
    description: 'A block cannot be cut short in the lock time',
    error: 'UnexpectedEndOfBlockData',
  },
];

tests.forEach(({args, description, error, expected}) => {
  return test(description, () => {
    if (!!error) {
      throws(() => scanBlockForUtxos(args), new Error(error), 'Got error');
    } else {
      deepEqual(scanBlockForUtxos(args), expected, 'Got utxos');
    }

    return;
  });
});

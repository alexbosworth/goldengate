const {createHash} = require('node:crypto');
const {deepEqual} = require('node:assert').strict;
const {rejects} = require('node:assert').strict;
const test = require('node:test');

const {idForTransaction} = require('@alexbosworth/blockchain');
const {makeLnd} = require('mock-lnd');
const {makeRpcError} = require('mock-lnd');

const {encodeTransaction} = require('./../../transactions');
const scanBatch = require('./../../chain/scan_batch_for_utxos');

const bufferAsHex = buffer => Buffer.from(buffer).toString('hex');
const script = `5120${'11'.repeat(32)}`;
const sha256 = n => createHash('sha256').update(n).digest('hex');
const witness = [Buffer.alloc(32, 1).toString('hex')];

const funding = encodeTransaction({
  inputs: [{id: sha256('1'), script: '', sequence: 0, vout: 0, witness}],
  locktime: 0,
  outputs: [{script, tokens: 200000}],
  version: 2,
}).transaction;

const fundingId = idForTransaction({transaction: funding}).id;

// A fake LND with blocks from height 99 to 104, where block 101 pays a utxo
const chainLnd = args => makeLnd({
  chain: {
    blocks: [{}, {}, {transactions: [funding]}, {}, {}, {}],
    height: 99,
  },
  failures: args.failures,
});

// The id of the block at a height of the chain
const idAt = height => {
  const lnd = chainLnd({});
  const block = {};

  // A fake LND responds right away
  lnd.blocks.getBlockHash({block_height: height}, (err, res) => {
    block.id = bufferAsHex(Buffer.from(res.block_hash).reverse());
  });

  return block.id;
};

const makeArgs = overrides => {
  const args = {
    heights: [100, 101, 102, 103, 104],
    id: idAt(99),
    lnd: chainLnd({}),
    output_script: script,
    utxos: [],
  };

  Object.keys(overrides).forEach(k => args[k] = overrides[k]);

  return args;
};

const utxo = {
  confirmation_height: 101,
  tokens: 200000,
  transaction_id: fundingId,
  transaction_vout: 0,
};

const tests = [
  {
    args: makeArgs({
      heights: [100],
      id: undefined,
      lnd: chainLnd({
        failures: [{details: 'err', method: 'getBlock', type: 'blocks'}],
      }),
    }),
    description: 'An error getting a block is passed back',
    error: [
      503,
      'UnexpectedErrorWhenGettingChainBlock',
      {err: makeRpcError({details: 'err'})},
    ],
  },
  {
    args: makeArgs({heights: [100, 101], id: sha256('other')}),
    description: 'An error scanning the blocks is passed back',
    error: [503, 'UnexpectedReorgScanningForSharedUtxos'],
  },
  {
    args: makeArgs({}),
    description: 'A batch of blocks is scanned for utxos',
    expected: {id: idAt(104), utxos: [utxo]},
  },
];

tests.forEach(({args, description, error, expected}) => {
  return test(description, async () => {
    if (!!error) {
      await rejects(scanBatch(args), error, 'Got expected error');
    } else {
      deepEqual(await scanBatch(args), expected, 'Got expected scan');
    }

    return;
  });
});

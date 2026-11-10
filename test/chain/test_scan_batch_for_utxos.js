const {createHash} = require('node:crypto');
const {deepEqual} = require('node:assert').strict;
const {rejects} = require('node:assert').strict;
const test = require('node:test');

const {idForBlock} = require('@alexbosworth/blockchain');
const {idForTransaction} = require('@alexbosworth/blockchain');
const {numberAsCompactInt} = require('@alexbosworth/blockchain');

const {encodeTransaction} = require('./../../transactions');
const scanBatch = require('./../../chain/scan_batch_for_utxos');

const hexAsBuffer = hex => Buffer.from(hex, 'hex');
const otherScript = `0014${'22'.repeat(20)}`;
const script = `5120${'11'.repeat(32)}`;
const sha256 = n => createHash('sha256').update(n).digest('hex');
const witness = [Buffer.alloc(32, 1).toString('hex')];

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

// A block header has the id of the block before it
const headerFor = height => {
  const header = Buffer.alloc(80);

  header.writeUInt32LE(height, 68);

  if (!height) {
    return header;
  }

  const {id} = idForBlock({block: headerFor(height - 1).toString('hex')});

  hexAsBuffer(id).reverse().copy(header, 4);

  return header;
};

// A block at height 101 pays a utxo, other blocks only have a coinbase
const blockAt = height => Buffer.concat([
  headerFor(height),
  numberAsCompactInt({number: height === 101 ? 2 : 1}).encoded,
  ...(height === 101 ? [coinbase, funding] : [coinbase]).map(hexAsBuffer),
]);

const idAt = height => idForBlock({block: headerFor(height).toString('hex')});

// A block is only expected to be fetched once
const makeLnd = ({err}) => {
  const fetched = new Set();

  return {
    blocks: {
      getBlock: ({block_hash}, cbk) => {
        const height = block_hash.readUInt32LE();

        if (fetched.has(height)) {
          return cbk([500, 'UnexpectedBlockFetch', {height}]);
        }

        fetched.add(height);

        if (!!err) {
          return cbk(err);
        }

        return cbk(null, {raw_block: blockAt(height)});
      },
      getBlockHash: ({block_height}, cbk) => {
        const hash = Buffer.alloc(32);

        hash.writeUInt32LE(block_height);

        return cbk(null, {block_hash: hash});
      },
    },
  };
};

const makeArgs = overrides => {
  const args = {
    heights: [100, 101, 102, 103, 104],
    id: idAt(99).id,
    lnd: makeLnd({}),
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
      lnd: makeLnd({err: 'err'}),
    }),
    description: 'An error getting a block is passed back',
    error: [503, 'UnexpectedErrorWhenGettingChainBlock', {err: 'err'}],
  },
  {
    args: makeArgs({heights: [100, 101], id: sha256('other')}),
    description: 'An error scanning the blocks is passed back',
    error: [503, 'UnexpectedReorgScanningForSharedUtxos'],
  },
  {
    args: makeArgs({}),
    description: 'A batch of blocks is scanned for utxos',
    expected: {id: idAt(104).id, utxos: [utxo]},
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

const {createHash} = require('node:crypto');
const {deepEqual} = require('node:assert').strict;
const {rejects} = require('node:assert').strict;
const test = require('node:test');

const {idForBlock} = require('@alexbosworth/blockchain');
const {idForTransaction} = require('@alexbosworth/blockchain');
const {numberAsCompactInt} = require('@alexbosworth/blockchain');

const {encodeTransaction} = require('./../../transactions');
const {getSharedUtxos} = require('./../../');
const {sharedAddressScript} = require('./../../');

const clientKey = '031b84c5567b126440995d3ed5aaba0565d71e1834604819ff9c17f5e9d5dd078f';
const hexAsBuffer = hex => Buffer.from(hex, 'hex');
const otherScript = `0014${'00'.repeat(20)}`;
const serviceKey = '024d4b6cd1361032ca9bd2aeb9d900aa4d45d9ead80ac9423374c451a7254d0766';
const sha256 = n => createHash('sha256').update(n).digest('hex');
const witness = [Buffer.alloc(32, 1).toString('hex')];

const {address, output_script} = sharedAddressScript({
  client_public_key: clientKey,
  expiry: 14400,
  network: 'btc',
  server_public_key: serviceKey,
});

// A block header has the id of the block before it
const headerFor = height => {
  const header = Buffer.alloc(80);

  // Every header is different with a timestamp of the height
  header.writeUInt32LE(height, 68);

  if (!height) {
    return header;
  }

  const {id} = idForBlock({block: headerFor(height - 1).toString('hex')});

  hexAsBuffer(id).reverse().copy(header, 4);

  return header;
};

const idAt = height => idForBlock({block: headerFor(height).toString('hex')});

// A block is a header, a count of transactions, and then the transactions
const blockOf = ({height, is_fork, transactions}) => {
  const header = headerFor(height);

  // A block on a different chain builds on a different block
  if (!!is_fork) {
    hexAsBuffer(sha256('fork')).copy(header, 4);
  }

  return Buffer.concat([
    header,
    numberAsCompactInt({number: transactions.length}).encoded,
    ...transactions.map(hexAsBuffer),
  ]);
};

const coinbase = height => encodeTransaction({
  inputs: [{
    id: Buffer.alloc(32).toString('hex'),
    script: Buffer.from([1, height]).toString('hex'),
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
  outputs: [
    {tokens: 200000, script: output_script},
    {tokens: 100000, script: output_script},
  ],
  version: 2,
}).transaction;

const fundingId = idForTransaction({transaction: funding}).id;

// Spend the first utxo with change back to the shared address
const spend = encodeTransaction({
  inputs: [{id: fundingId, script: '', sequence: 0, vout: 0, witness}],
  locktime: 0,
  outputs: [
    {script: otherScript, tokens: 150000},
    {tokens: 49000, script: output_script},
  ],
  version: 2,
}).transaction;

const spendId = idForTransaction({transaction: spend}).id;

// Blocks by height, every other block only has a coinbase
const makeBlocks = extra => ({
  100: [coinbase(100), funding],
  101: [coinbase(101)],
  ...extra,
});

const getInfo = height => ({
  alias: '',
  best_header_timestamp: 1,
  block_hash: Buffer.alloc(32).toString('hex'),
  block_height: height,
  chains: [{chain: 'bitcoin', network: 'mainnet'}],
  color: '#000000',
  features: {},
  identity_pubkey: `02${'00'.repeat(32)}`,
  num_active_channels: 0,
  num_peers: 0,
  num_pending_channels: 0,
  synced_to_chain: true,
  uris: [],
  version: '',
});

// A block is only expected to be fetched once, and not before the start
const makeLnd = ({blocks, err, fork, header, raw, start, tip}) => {
  const fetched = new Set();

  return {
    blocks: {
      getBlock: ({block_hash}, cbk) => {
        const height = block_hash.readUInt32LE();

        if (fetched.has(height) || height < (start || 0)) {
          return cbk([500, 'UnexpectedBlockFetch', {height}]);
        }

        fetched.add(height);

        if (!!err) {
          return cbk(err);
        }

        if (!!raw) {
          return cbk(null, {raw_block: raw});
        }

        const transactions = blocks[height] || [coinbase(height % 256)];

        return cbk(null, {
          raw_block: blockOf({height, transactions, is_fork: fork === height}),
        });
      },
      getBlockHash: ({block_height}, cbk) => {
        const hash = Buffer.alloc(32);

        hash.writeUInt32LE(block_height);

        return cbk(null, {block_hash: hash});
      },
      getBlockHeader: ({block_hash}, cbk) => {
        const height = block_hash.readUInt32LE();

        if (!!err) {
          return cbk(err);
        }

        if (!!header) {
          return cbk(null, {raw_block_header: header});
        }

        const block = blockOf({
          height,
          is_fork: fork === height,
          transactions: [],
        });

        return cbk(null, {raw_block_header: block.subarray(0, 80)});
      },
    },
    default: {getInfo: ({}, cbk) => cbk(null, getInfo(tip))},
  };
};

const utxo = (id, vout, tokens, height) => ({
  tokens,
  confirmation_height: height,
  transaction_id: id,
  transaction_vout: vout,
});

// A utxo with a count of its confirmations
const counted = (count, unspent) => ({...unspent, confirmation_count: count});

// Respond to Blockstream API requests for unspent outputs and the chain tip
const makeRequest = ({tip, utxos}) => ({url}, cbk) => {
  // Exit early with the chain tip height when there is a tip
  if (url === 'https://blockstream.info/api/blocks/tip/height' && !!tip) {
    return cbk(null, {statusCode: 200}, String(tip));
  }

  if (url !== `https://blockstream.info/api/address/${address}/utxo`) {
    return cbk(new Error('UnexpectedUrl'));
  }

  return cbk(null, {statusCode: 200}, utxos);
};

// Blockstream API utxos, one confirmed and one in the mempool
const apiUtxos = [
  {
    status: {block_height: 100, confirmed: true},
    txid: fundingId,
    value: 100000,
    vout: 1,
  },
  {
    status: {confirmed: false},
    txid: spendId,
    value: 49000,
    vout: 1,
  },
];

const makeArgs = overrides => {
  const args = {
    address,
    lnd: makeLnd({blocks: makeBlocks(), tip: 102}),
    min_height: 100,
    network: 'btc',
  };

  Object.keys(overrides).forEach(k => args[k] = overrides[k]);

  return args;
};

const tests = [
  {
    args: makeArgs({address: undefined}),
    description: 'A shared address is expected',
    error: [400, 'ExpectedSharedAddressToGetUtxosFor'],
  },
  {
    args: makeArgs({utxos: {}}),
    description: 'Known utxos are expected to be an array',
    error: [400, 'ExpectedArrayOfKnownSharedUtxos'],
  },
  {
    args: makeArgs({utxos: [utxo(fundingId, 0, 0, 100)]}),
    description: 'Known utxos are expected to be valid',
    error: [400, 'ExpectedValidKnownSharedUtxos'],
  },
  {
    args: makeArgs({utxos: [utxo(fundingId, 0, 1, -1)]}),
    description: 'Known utxo heights are expected to be valid',
    error: [400, 'ExpectedValidKnownSharedUtxos'],
  },
  {
    args: makeArgs({utxos: [utxo(fundingId, 0, 1, undefined)]}),
    description: 'Known utxos are expected to have heights to scan blocks',
    error: [400, 'ExpectedConfirmationHeightsToScanForUtxos'],
  },
  {
    args: makeArgs({utxos: [utxo(fundingId, 4294967296, 1, 100)]}),
    description: 'Known utxo output indexes are expected to be valid',
    error: [400, 'ExpectedValidKnownSharedUtxos'],
  },
  {
    args: makeArgs({lnd: undefined}),
    description: 'An LND or a request function is expected',
    error: [400, 'ExpectedLndOrRequestToGetSharedUtxos'],
  },
  {
    args: makeArgs({min_height: undefined}),
    description: 'A starting height is expected to scan blocks',
    error: [400, 'ExpectedMinHeightToScanForSharedUtxos'],
  },
  {
    args: makeArgs({id: 'id'}),
    description: 'A scanned block id is expected to be valid',
    error: [400, 'ExpectedValidScannedBlockIdToScanForUtxos'],
  },
  {
    args: makeArgs({utxos: [utxo(fundingId, 1, 100000, 100)]}),
    description: 'Known utxos are expected with a scanned block id',
    error: [400, 'ExpectedScannedBlockIdToScanForKnownUtxos'],
  },
  {
    args: makeArgs({network: 'network'}),
    description: 'A known network is expected',
    error: [400, 'ExpectedKnownNetworkToGetSharedUtxos'],
  },
  {
    args: makeArgs({network: 'btctestnet'}),
    description: 'The address is expected to be for the network',
    error: [400, 'ExpectedValidSharedAddressToGetUtxosFor'],
  },
  {
    args: makeArgs({lnd: makeLnd({err: 'err', tip: 102})}),
    description: 'An error getting a block is passed back',
    error: [503, 'UnexpectedErrorWhenGettingChainBlock', {err: 'err'}],
  },
  {
    args: makeArgs({
      id: idAt(102).id,
      lnd: makeLnd({err: 'err', tip: 102}),
      min_height: 103,
    }),
    description: 'An error getting the scanned block header is passed back',
    error: [503, 'UnexpectedErrorWhenGettingBlockHeader', {err: 'err'}],
  },
  {
    args: makeArgs({
      id: idAt(102).id,
      lnd: makeLnd({header: Buffer.alloc(79), tip: 102}),
      min_height: 103,
    }),
    description: 'The scanned block header is expected to be a block header',
    error: [503, 'ExpectedBlockHeaderForScannedBlock'],
  },
  {
    args: makeArgs({
      lnd: makeLnd({blocks: {}, raw: Buffer.alloc(82), tip: 102}),
    }),
    description: 'A block that cannot be scanned is an error',
    error: [
      503,
      'FailedToScanBlockForSharedUtxos',
      {err: new Error('UnexpectedDataAfterBlockTransactions')},
    ],
  },
  {
    args: makeArgs({
      lnd: makeLnd({blocks: makeBlocks(), fork: 110, tip: 120}),
    }),
    description: 'A chain reorganization in a batch of blocks is an error',
    error: [503, 'UnexpectedReorgScanningForSharedUtxos'],
  },
  {
    args: makeArgs({
      lnd: makeLnd({blocks: makeBlocks(), fork: 108, tip: 120}),
    }),
    description: 'A chain reorganization between batches is an error',
    error: [503, 'UnexpectedReorgScanningForSharedUtxos'],
  },
  {
    args: makeArgs({
      id: sha256('stale'),
      lnd: makeLnd({blocks: makeBlocks(), tip: 120}),
      min_height: 103,
      utxos: [utxo(fundingId, 1, 100000, 100)],
    }),
    description: 'A reorg of scanned blocks is an error',
    error: [409, 'UnexpectedReorgOfScannedBlocksForSharedUtxos'],
  },
  {
    args: makeArgs({
      id: sha256('stale'),
      min_height: 103,
      utxos: [utxo(fundingId, 1, 100000, 100)],
    }),
    description: 'A same height reorg of the last scanned block is an error',
    error: [409, 'UnexpectedReorgOfScannedBlocksForSharedUtxos'],
  },
  {
    args: makeArgs({
      id: idAt(102).id,
      lnd: makeLnd({blocks: makeBlocks(), fork: 103, tip: 103}),
      min_height: 103,
      utxos: [utxo(fundingId, 1, 100000, 100)],
    }),
    description: 'A reorg after checking the scanned block is an error',
    error: [503, 'UnexpectedReorgScanningForSharedUtxos'],
  },
  {
    args: makeArgs({}),
    description: 'Blocks are scanned for utxos',
    expected: {
      utxos: [
        counted(3, utxo(fundingId, 0, 200000, 100)),
        counted(3, utxo(fundingId, 1, 100000, 100)),
      ],
      height: 102,
      id: idAt(102).id,
    },
  },
  {
    args: makeArgs({
      lnd: makeLnd({
        blocks: makeBlocks({112: [coinbase(112), spend]}),
        tip: 120,
      }),
    }),
    description: 'Utxos spent in later blocks are not unspent utxos',
    expected: {
      utxos: [
        counted(21, utxo(fundingId, 1, 100000, 100)),
        counted(9, utxo(spendId, 1, 49000, 112)),
      ],
      height: 120,
      id: idAt(120).id,
    },
  },
  {
    args: makeArgs({
      id: idAt(102).id,
      lnd: makeLnd({
        blocks: makeBlocks({112: [coinbase(112), spend]}),
        tip: 120,
      }),
      min_height: 103,
      utxos: [
        utxo(fundingId, 0, 200000, 100),
        utxo(fundingId, 1, 100000, 100),
      ],
    }),
    description: 'A scan continues from the last scanned block',
    expected: {
      utxos: [
        counted(21, utxo(fundingId, 1, 100000, 100)),
        counted(9, utxo(spendId, 1, 49000, 112)),
      ],
      height: 120,
      id: idAt(120).id,
    },
  },
  {
    args: makeArgs({
      lnd: makeLnd({
        blocks: makeBlocks({115: [coinbase(115), spend]}),
        tip: 120,
      }),
    }),
    description: 'Blocks are scanned in order across batches',
    expected: {
      utxos: [
        counted(21, utxo(fundingId, 1, 100000, 100)),
        counted(6, utxo(spendId, 1, 49000, 115)),
      ],
      height: 120,
      id: idAt(120).id,
    },
  },
  {
    args: makeArgs({
      id: idAt(102).id,
      lnd: makeLnd({blocks: makeBlocks(), start: 103, tip: 120}),
      min_height: 103,
      utxos: [utxo(fundingId, 1, 100000, 100)],
    }),
    description: 'A continued scan only gets blocks after the scanned block',
    expected: {
      utxos: [counted(21, utxo(fundingId, 1, 100000, 100))],
      height: 120,
      id: idAt(120).id,
    },
  },
  {
    args: makeArgs({
      id: idAt(102).id,
      lnd: makeLnd({blocks: makeBlocks(), start: 103, tip: 120}),
      min_height: 103,
      utxos: [counted(3, utxo(fundingId, 1, 100000, 100))],
    }),
    description: 'Confirmations of known utxos are counted again',
    expected: {
      utxos: [counted(21, utxo(fundingId, 1, 100000, 100))],
      height: 120,
      id: idAt(120).id,
    },
  },
  {
    args: makeArgs({
      id: idAt(99).id,
      utxos: [
        utxo(sha256('earlier'), 3, 70000, 99),
        utxo(fundingId, 1, 100000, 100),
      ],
      lnd: makeLnd({
        blocks: makeBlocks({101: [coinbase(101), spend]}),
        tip: 102,
      }),
    }),
    description: 'Known utxos from scanned blocks are found again',
    expected: {
      utxos: [
        counted(4, utxo(sha256('earlier'), 3, 70000, 99)),
        counted(3, utxo(fundingId, 1, 100000, 100)),
        counted(2, utxo(spendId, 1, 49000, 101)),
      ],
      height: 102,
      id: idAt(102).id,
    },
  },
  {
    args: makeArgs({
      id: idAt(102).id,
      utxos: [utxo(fundingId, 1, 100000, 100)],
      min_height: 103,
    }),
    description: 'There can be no blocks to scan',
    expected: {
      utxos: [counted(3, utxo(fundingId, 1, 100000, 100))],
      height: 102,
      id: idAt(102).id,
    },
  },
  {
    args: makeArgs({
      id: idAt(102).id.toUpperCase(),
      utxos: [utxo(fundingId, 1, 100000, 100)],
      min_height: 103,
    }),
    description: 'Scanned block ids are not case sensitive',
    expected: {
      utxos: [counted(3, utxo(fundingId, 1, 100000, 100))],
      height: 102,
      id: idAt(102).id,
    },
  },
  {
    args: makeArgs({utxos: [], min_height: 103}),
    description: 'No scanned block id is needed without known utxos',
    expected: {utxos: [], height: 102, id: undefined},
  },
  {
    args: makeArgs({
      id: idAt(109).id,
      utxos: [utxo(fundingId, 1, 100000, 100)],
      min_height: 110,
    }),
    description: 'The height does not go back when the chain tip is behind',
    expected: {
      utxos: [counted(10, utxo(fundingId, 1, 100000, 100))],
      height: 109,
      id: idAt(109).id,
    },
  },
  {
    args: makeArgs({
      id: idAt(99).id,
      utxos: [
        utxo(sha256('earlier'), 3, 70000, 99),
        utxo(sha256('reorganized'), 0, 5000, 100),
      ],
    }),
    description: 'Known utxos not seen again in scanned blocks are dropped',
    expected: {
      utxos: [
        counted(4, utxo(sha256('earlier'), 3, 70000, 99)),
        counted(3, utxo(fundingId, 0, 200000, 100)),
        counted(3, utxo(fundingId, 1, 100000, 100)),
      ],
      height: 102,
      id: idAt(102).id,
    },
  },
  {
    args: {
      address,
      network: 'btc',
      request: makeRequest({tip: 102, utxos: apiUtxos}),
    },
    description: 'Utxos are found with the Blockstream API',
    expected: {
      utxos: [
        counted(3, utxo(fundingId, 1, 100000, 100)),
        counted(0, utxo(spendId, 1, 49000, undefined)),
      ],
    },
  },
  {
    args: {
      address,
      network: 'btc',
      request: makeRequest({tip: 99, utxos: apiUtxos}),
    },
    description: 'A utxo above the API chain tip has a confirmation',
    expected: {
      utxos: [
        counted(1, utxo(fundingId, 1, 100000, 100)),
        counted(0, utxo(spendId, 1, 49000, undefined)),
      ],
    },
  },
  {
    args: {address, network: 'btc', request: makeRequest({utxos: apiUtxos})},
    description: 'An error getting the API chain tip is passed back',
    error: [
      503,
      'UnexpectedErrorGettingChainTipHeight',
      {err: new Error('UnexpectedUrl')},
    ],
  },
  {
    args: {
      address,
      utxos: [utxo(spendId, 1, 49000, undefined)],
      network: 'btc',
      request: makeRequest({
        utxos: [
          {status: {confirmed: false}, txid: fundingId, value: 1, vout: 1},
        ],
      }),
    },
    description: 'Known utxos are not used with the Blockstream API',
    expected: {utxos: [counted(0, utxo(fundingId, 1, 1, undefined))]},
  },
  {
    args: {
      address,
      network: 'btc',
      request: makeRequest({
        utxos: [
          {status: {confirmed: false}, txid: fundingId, value: 0, vout: 0},
          {status: {confirmed: false}, txid: fundingId, value: 1, vout: 1},
        ],
      }),
    },
    description: 'Outputs without value are not utxos',
    expected: {utxos: [counted(0, utxo(fundingId, 1, 1, undefined))]},
  },
  {
    args: {
      address,
      network: 'btc',
      request: makeRequest({
        utxos: [
          {status: {confirmed: false}, txid: fundingId, value: '1', vout: 0},
        ],
      }),
    },
    description: 'Blockstream API utxos are expected to be valid',
    error: [503, 'ExpectedValidUtxosInBlockstreamResponse'],
  },
  {
    args: {
      address,
      network: 'btc',
      request: makeRequest({
        utxos: [
          {status: {block_height: -1}, txid: fundingId, value: 1, vout: 0},
        ],
      }),
    },
    description: 'Blockstream API heights are expected to be valid',
    error: [503, 'ExpectedValidUtxosInBlockstreamResponse'],
  },
];

tests.forEach(({args, description, error, expected}) => {
  return test(description, async () => {
    if (!!error) {
      await rejects(getSharedUtxos(args), error, 'Got error');
    } else {
      deepEqual(await getSharedUtxos(args), expected, 'Got result');
    }

    return;
  });
});

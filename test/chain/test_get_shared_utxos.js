const {createHash} = require('node:crypto');
const {deepEqual} = require('node:assert').strict;
const {rejects} = require('node:assert').strict;
const test = require('node:test');

const {idForTransaction} = require('@alexbosworth/blockchain');
const {makeLnd} = require('mock-lnd');
const {makeRpcError} = require('mock-lnd');
const {reorgChain} = require('mock-lnd');

const {encodeTransaction} = require('./../../transactions');
const {getSharedUtxos} = require('./../../');
const {sharedAddressScript} = require('./../../');

const bufferAsHex = buffer => Buffer.from(buffer).toString('hex');
const clientKey = '031b84c5567b126440995d3ed5aaba0565d71e1834604819ff9c17f5e9d5dd078f';
const firstHeight = 99;
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

// Heights from a height through to a height
const heightsFrom = (from, to) => {
  return [...Array(to - from + 1).keys()].map(n => from + n);
};

// A fake LND with blocks from height 99 to the tip, with transactions at
const chainLnd = ({at, tip}) => {
  // The block at height 100 funds the shared address
  const transactions = {100: [funding], ...at};

  const heights = heightsFrom(firstHeight, tip);

  return makeLnd({
    chain: {
      blocks: heights.map(height => ({transactions: transactions[height]})),
      height: firstHeight,
    },
  });
};

// The id of the block at a height of a chain
const idAt = (height, chain) => {
  const lnd = chainLnd(chain || {tip: 102});
  const block = {};

  // A fake LND responds right away
  lnd.blocks.getBlockHash({block_height: height}, (err, res) => {
    block.id = bufferAsHex(Buffer.from(res.block_hash).reverse());
  });

  return block.id;
};

// A fake LND where the chain is reorganized during a scan of blocks
const reorgingLnd = ({at, tip}) => {
  const lnd = chainLnd({tip});
  const state = {};

  const {getBlockHash} = lnd.blocks;

  lnd.blocks.getBlockHash = (args, cbk) => {
    // The block before is replaced the first time the block is asked for
    if (args.block_height === at && !state.is_reorganized) {
      state.is_reorganized = true;

      reorgChain({lnd, height: at - 1});
    }

    return getBlockHash(args, cbk);
  };

  return lnd;
};

// A fake LND that gives a response that LND would not give for blocks
const malformedLnd = ({method, response}) => {
  const lnd = chainLnd({tip: 102});

  lnd.blocks[method] = ({}, cbk) => cbk(null, response);

  return lnd;
};

// A fake LND where getting a block fails
const failingLnd = method => makeLnd({
  chain: {blocks: [{}, {}, {}], height: 100},
  failures: [{method, details: 'err', type: 'blocks'}],
});

// The heights of the blocks that a fake LND gave
const fetchedHeights = ({calls}) => {
  const hashes = calls.filter(n => n.method === 'getBlockHash');

  return calls.filter(n => n.method === 'getBlock').map(call => {
    const asked = hashes.find(hash => {
      return hash.response.block_hash.equals(call.args.block_hash);
    });

    return asked.args.block_height;
  });
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
    lnd: chainLnd({tip: 102}),
    min_height: 100,
    network: 'btc',
  };

  Object.keys(overrides).forEach(k => args[k] = overrides[k]);

  return args;
};

// Get the shared utxos, and the heights of the blocks that LND gave
const utxosOf = async args => {
  const res = await getSharedUtxos(args);

  // Exit early when the utxos are from the Blockstream API
  if (!args.lnd) {
    return res;
  }

  return {...res, fetched: fetchedHeights(args.lnd)};
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
    args: makeArgs({lnd: failingLnd('getBlock')}),
    description: 'An error getting a block is passed back',
    error: [
      503,
      'UnexpectedErrorWhenGettingChainBlock',
      {err: makeRpcError({details: 'err'})},
    ],
  },
  {
    args: makeArgs({
      id: idAt(102),
      lnd: failingLnd('getBlockHeader'),
      min_height: 103,
    }),
    description: 'An error getting the scanned block header is passed back',
    error: [
      503,
      'UnexpectedErrorWhenGettingBlockHeader',
      {err: makeRpcError({details: 'err'})},
    ],
  },
  {
    args: makeArgs({
      id: idAt(102),
      lnd: malformedLnd({
        method: 'getBlockHeader',
        response: {raw_block_header: Buffer.alloc(79)},
      }),
      min_height: 103,
    }),
    description: 'The scanned block header is expected to be a block header',
    error: [503, 'ExpectedBlockHeaderForScannedBlock'],
  },
  {
    args: makeArgs({
      lnd: malformedLnd({
        method: 'getBlock',
        response: {raw_block: Buffer.alloc(82)},
      }),
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
      lnd: reorgingLnd({at: 110, tip: 120}),
    }),
    description: 'A chain reorganization in a batch of blocks is an error',
    error: [503, 'UnexpectedReorgScanningForSharedUtxos'],
  },
  {
    args: makeArgs({
      lnd: reorgingLnd({at: 108, tip: 120}),
    }),
    description: 'A chain reorganization between batches is an error',
    error: [503, 'UnexpectedReorgScanningForSharedUtxos'],
  },
  {
    args: makeArgs({
      id: sha256('stale'),
      lnd: chainLnd({tip: 120}),
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
      id: idAt(102),
      lnd: reorgingLnd({at: 103, tip: 103}),
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
      fetched: heightsFrom(100, 102),
      utxos: [
        counted(3, utxo(fundingId, 0, 200000, 100)),
        counted(3, utxo(fundingId, 1, 100000, 100)),
      ],
      height: 102,
      id: idAt(102),
    },
  },
  {
    args: makeArgs({
      lnd: chainLnd({at: {112: [spend]}, tip: 120}),
    }),
    description: 'Utxos spent in later blocks are not unspent utxos',
    expected: {
      fetched: heightsFrom(100, 120),
      utxos: [
        counted(21, utxo(fundingId, 1, 100000, 100)),
        counted(9, utxo(spendId, 1, 49000, 112)),
      ],
      height: 120,
      id: idAt(120, {at: {112: [spend]}, tip: 120}),
    },
  },
  {
    args: makeArgs({
      id: idAt(102),
      lnd: chainLnd({at: {112: [spend]}, tip: 120}),
      min_height: 103,
      utxos: [
        utxo(fundingId, 0, 200000, 100),
        utxo(fundingId, 1, 100000, 100),
      ],
    }),
    description: 'A scan continues from the last scanned block',
    expected: {
      fetched: heightsFrom(103, 120),
      utxos: [
        counted(21, utxo(fundingId, 1, 100000, 100)),
        counted(9, utxo(spendId, 1, 49000, 112)),
      ],
      height: 120,
      id: idAt(120, {at: {112: [spend]}, tip: 120}),
    },
  },
  {
    args: makeArgs({
      lnd: chainLnd({at: {115: [spend]}, tip: 120}),
    }),
    description: 'Blocks are scanned in order across batches',
    expected: {
      fetched: heightsFrom(100, 120),
      utxos: [
        counted(21, utxo(fundingId, 1, 100000, 100)),
        counted(6, utxo(spendId, 1, 49000, 115)),
      ],
      height: 120,
      id: idAt(120, {at: {115: [spend]}, tip: 120}),
    },
  },
  {
    args: makeArgs({
      id: idAt(102),
      lnd: chainLnd({tip: 120}),
      min_height: 103,
      utxos: [utxo(fundingId, 1, 100000, 100)],
    }),
    description: 'A continued scan only gets blocks after the scanned block',
    expected: {
      fetched: heightsFrom(103, 120),
      utxos: [counted(21, utxo(fundingId, 1, 100000, 100))],
      height: 120,
      id: idAt(120, {tip: 120}),
    },
  },
  {
    args: makeArgs({
      id: idAt(102),
      lnd: chainLnd({tip: 120}),
      min_height: 103,
      utxos: [counted(3, utxo(fundingId, 1, 100000, 100))],
    }),
    description: 'Confirmations of known utxos are counted again',
    expected: {
      fetched: heightsFrom(103, 120),
      utxos: [counted(21, utxo(fundingId, 1, 100000, 100))],
      height: 120,
      id: idAt(120, {tip: 120}),
    },
  },
  {
    args: makeArgs({
      id: idAt(99),
      utxos: [
        utxo(sha256('earlier'), 3, 70000, 99),
        utxo(fundingId, 1, 100000, 100),
      ],
      lnd: chainLnd({at: {101: [spend]}, tip: 102}),
    }),
    description: 'Known utxos from scanned blocks are found again',
    expected: {
      fetched: heightsFrom(100, 102),
      utxos: [
        counted(4, utxo(sha256('earlier'), 3, 70000, 99)),
        counted(3, utxo(fundingId, 1, 100000, 100)),
        counted(2, utxo(spendId, 1, 49000, 101)),
      ],
      height: 102,
      id: idAt(102, {at: {101: [spend]}, tip: 102}),
    },
  },
  {
    args: makeArgs({
      id: idAt(102),
      utxos: [utxo(fundingId, 1, 100000, 100)],
      min_height: 103,
    }),
    description: 'There can be no blocks to scan',
    expected: {
      fetched: [],
      utxos: [counted(3, utxo(fundingId, 1, 100000, 100))],
      height: 102,
      id: idAt(102),
    },
  },
  {
    args: makeArgs({
      id: idAt(102).toUpperCase(),
      utxos: [utxo(fundingId, 1, 100000, 100)],
      min_height: 103,
    }),
    description: 'Scanned block ids are not case sensitive',
    expected: {
      fetched: [],
      utxos: [counted(3, utxo(fundingId, 1, 100000, 100))],
      height: 102,
      id: idAt(102),
    },
  },
  {
    args: makeArgs({utxos: [], min_height: 103}),
    description: 'No scanned block id is needed without known utxos',
    expected: {fetched: [], utxos: [], height: 102, id: undefined},
  },
  {
    args: makeArgs({
      id: idAt(109, {tip: 109}),
      utxos: [utxo(fundingId, 1, 100000, 100)],
      min_height: 110,
    }),
    description: 'The height does not go back when the chain tip is behind',
    expected: {
      fetched: [],
      utxos: [counted(10, utxo(fundingId, 1, 100000, 100))],
      height: 109,
      id: idAt(109, {tip: 109}),
    },
  },
  {
    args: makeArgs({
      id: idAt(99),
      utxos: [
        utxo(sha256('earlier'), 3, 70000, 99),
        utxo(sha256('reorganized'), 0, 5000, 100),
      ],
    }),
    description: 'Known utxos not seen again in scanned blocks are dropped',
    expected: {
      fetched: heightsFrom(100, 102),
      utxos: [
        counted(4, utxo(sha256('earlier'), 3, 70000, 99)),
        counted(3, utxo(fundingId, 0, 200000, 100)),
        counted(3, utxo(fundingId, 1, 100000, 100)),
      ],
      height: 102,
      id: idAt(102),
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
      deepEqual(await utxosOf(args), expected, 'Got result');
    }

    return;
  });
});

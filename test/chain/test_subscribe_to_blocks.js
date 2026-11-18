const {deepEqual} = require('node:assert').strict;
const test = require('node:test');
const {throws} = require('node:assert').strict;

const {makeLnd} = require('mock-lnd');
const {makeRpcError} = require('mock-lnd');
const {mineBlocks} = require('mock-lnd');

const {subscribeToBlocks} = require('./../../');

const api = 'https://blockstream.info/testnet/api';
const network = 'btctestnet';
const {nextTick} = process;
const okStatus = {statusCode: 200};

// Blocks at the tip of the chain
const blocks = [1, 2, 3].map(height => ({
  height,
  id: Buffer.alloc(32, height).toString('hex'),
}));

// A fake LND that mines blocks after it announces its tip, then fails
const announcingLnd = ({count}) => {
  const lnd = makeLnd({});

  const {registerBlockEpochNtfn} = lnd.chain;

  lnd.chain.registerBlockEpochNtfn = args => {
    const stream = registerBlockEpochNtfn(args);

    // The tip is announced on the next tick, then blocks are mined
    nextTick(() => nextTick(() => {
      mineBlocks({count, lnd});

      return stream.emit('error', makeRpcError({details: 'err'}));
    }));

    return stream;
  };

  return lnd;
};

// The blocks that a fake LND announces: its tip, then the blocks it mines
const announcedBlocks = ({count}) => {
  const lnd = makeLnd({});
  const tip = {};

  // A fake LND responds right away
  lnd.default.getInfo({}, (err, res) => tip.id = res.block_hash);

  // A fake LND with the same chain mines the same blocks
  const {blocks} = mineBlocks({count, lnd});

  return [{height: 1, id: tip.id}].concat(blocks);
};

// The error of a stream that fails in a fake LND
const lndError = [
  503,
  'UnexpectedErrInBlocksSubscription',
  {err: makeRpcError({details: 'err'})},
];

// A fake request that serves chain tips, then has no response
const makeRequest = ({tips}) => {
  const remaining = tips.slice();

  return ({url}, cbk) => {
    const tip = tips.find(n => url === `${api}/block/${n.id}`);

    // The details of a tip block give the height of the tip
    if (!!tip) {
      return cbk(null, okStatus, {height: tip.height});
    }

    // Requests are expected to be for tip blocks or for the tip hash
    if (url !== `${api}/blocks/tip/hash`) {
      return cbk([400, 'UnexpectedUrlRequested', {url}]);
    }

    // There is no response after all the tips are served
    if (!remaining.length) {
      return cbk();
    }

    return cbk(null, okStatus, remaining.shift().id);
  };
};

// Subscribe to blocks and collect the events up to the first error
const eventsOf = args => {
  const events = [];
  const sub = subscribeToBlocks(args);

  return new Promise(resolve => {
    sub.on('block', block => events.push(block));

    sub.on('error', err => {
      events.push(err);

      sub.removeAllListeners();

      return resolve({events});
    });
  });
};

const tests = [
  {
    args: {},
    description: 'LND or request is required',
    error: new Error('ExpectedLndOrRequestToSubscribeToBlocks'),
  },
  {
    args: {request: ({}) => {}},
    description: 'A network is required when request is given',
    error: new Error('ExpectedNetworkNameToSubscribeToBlocks'),
  },
  {
    args: {lnd: announcingLnd({count: 2})},
    description: 'Blocks from lnd are emitted',
    expected: {events: [...announcedBlocks({count: 2}), lndError]},
  },
  {
    args: {
      lnd: makeLnd({
        failures: [{
          details: 'err',
          method: 'registerBlockEpochNtfn',
          type: 'chain',
        }],
      }),
    },
    description: 'Errors in the lnd blocks subscription are emitted',
    expected: {events: [lndError]},
  },
  {
    args: {network, delay: 20, request: makeRequest({tips: blocks})},
    description: 'Blocks are emitted as the chain tip changes',
    expected: {
      events: [...blocks, [503, 'UnexpectedResponseGettingChainTipHash']],
    },
  },
  {
    args: {
      network,
      delay: 100,
      request: makeRequest({tips: [blocks[0], blocks[0]]}),
    },
    description: 'An unchanged chain tip is not emitted',
    expected: {
      events: [blocks[0], [503, 'UnexpectedResponseGettingChainTipHash']],
    },
  },
  {
    args: {network, request: makeRequest({tips: []})},
    description: 'Polling starts right away with the default delay',
    expected: {events: [[503, 'UnexpectedResponseGettingChainTipHash']]},
  },
];

tests.forEach(({args, description, error, expected}) => {
  return test(description, async () => {
    if (!!error) {
      throws(() => subscribeToBlocks(args), error, 'Got error');
    } else {
      deepEqual(await eventsOf(args), expected, 'Got expected events');
    }

    return;
  });
});

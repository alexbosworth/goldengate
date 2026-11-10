const {deepEqual} = require('node:assert').strict;
const EventEmitter = require('node:events');
const test = require('node:test');
const {throws} = require('node:assert').strict;

const {subscribeToBlocks} = require('./../../');

const api = 'https://blockstream.info/testnet/api';
const network = 'btctestnet';
const okStatus = {statusCode: 200};

// Blocks at the tip of the chain
const blocks = [1, 2, 3].map(height => ({
  height,
  id: Buffer.alloc(32, height).toString('hex'),
}));

// A fake LND that announces blocks, then fails
const makeLnd = ({announce}) => ({
  chain: {
    registerBlockEpochNtfn: ({}) => {
      const emitter = new EventEmitter();

      emitter.cancel = () => {};

      process.nextTick(() => {
        // Block hashes are in the reverse byte order of block ids
        announce.forEach(({height, id}) => {
          const hash = Buffer.from(id, 'hex').reverse();

          return emitter.emit('data', {hash, height});
        });

        return emitter.emit('error', 'err');
      });

      return emitter;
    },
  },
});

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
    args: {lnd: makeLnd({announce: blocks})},
    description: 'Blocks from lnd are emitted',
    expected: {
      events: [
        ...blocks,
        [503, 'UnexpectedErrInBlocksSubscription', {err: 'err'}],
      ],
    },
  },
  {
    args: {lnd: makeLnd({announce: []})},
    description: 'Errors in the lnd blocks subscription are emitted',
    expected: {
      events: [[503, 'UnexpectedErrInBlocksSubscription', {err: 'err'}]],
    },
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

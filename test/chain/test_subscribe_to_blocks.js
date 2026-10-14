const {deepEqual} = require('node:assert').strict;
const {equal} = require('node:assert').strict;
const EventEmitter = require('node:events');
const test = require('node:test');
const {throws} = require('node:assert').strict;

const {subscribeToBlocks} = require('./../../');

const api = 'https://blockstream.info/testnet/api/block';
const confirmationCount = 6;
const id = Buffer.alloc(32).toString('hex');
const network = 'btctestnet';
const okStatus = {statusCode: 200};

const makeRequest = ({tips}) => {
  return ({url}, cbk) => {
    if (url === `${api}/${id}`) {
      return cbk(null, okStatus, {height: 1});
    }

    if (!tips.length) {
      return cbk();
    }

    return cbk(null, okStatus, tips.shift());
  };
};

const tests = [
  {
    args: {
      lnd: {
        chain: {
          registerBlockEpochNtfn: ({}) => {
            const emitter = new EventEmitter();

            emitter.cancel = () => {};

            process.nextTick(() => emitter.emit('error', 'err'));

            return emitter;
          },
        },
      },
    },
    description: 'Errors in the lnd blocks subscription are emitted',
    expected: {
      events: [[503, 'UnexpectedErrInBlocksSubscription', {err: 'err'}]],
    },
  },
  {
    args: {network, delay: 100, request: makeRequest({tips: [id, id]})},
    description: 'An unchanged chain tip is not emitted',
    expected: {
      events: [
        {id, height: 1},
        [503, 'UnexpectedResponseGettingChainTipHash'],
      ],
    },
  },
  {
    args: {network, request: makeRequest({tips: [id]})},
    description: 'Polling starts right away with the default delay',
    expected: {events: [{id, height: 1}]},
  },
];

// Subscribers to blocks should receive block notifications
test(`Subscribe to blocks`, (t, end) => {
  throws(
    () => subscribeToBlocks({}),
    new Error('ExpectedLndOrRequestToSubscribeToBlocks'),
    'LND or request is required'
  )

  throws(
    () => subscribeToBlocks({request: ({}) => {}}),
    new Error('ExpectedNetworkNameToSubscribeToBlocks'),
    'A network is required when request is given'
  )

  let confs = confirmationCount;
  let err = 503;

  const hashes = [...Array(confirmationCount)]
    .map((_, i) => Buffer.alloc(32, i).toString('hex'));

  const request = ({url}, cbk) => {
    if (url === 'https://blockstream.info/testnet/api/blocks/tip/hash') {
      return cbk(null, okStatus, hashes[confs - 1]);
    }

    const height = hashes.map(hash => `${api}/${hash}`).indexOf(url);

    return cbk(null, okStatus, {height});
  };

  const sub = subscribeToBlocks({network, request, delay: 20});

  sub.on('error', err => {
    const [code, message] = err;

    equal(code, 503, 'Got expected error code');
    equal(message, 'UnexpectedResponseGettingChainTipHash', 'Got err message');

    return;
  });

  const blockEmitter = new EventEmitter();

  const lnd = {chain: {registerBlockEpochNtfn: () => blockEmitter}};
  const lndSub = subscribeToBlocks({lnd});

  lndSub.on('block', data => {
    equal(data.id.length, 64, 'Lnd block id emitted');
    equal(data.height, confs, 'Lnd block height emitted');

    return;
  });

  sub.on('end', () => {});
  sub.on('error', err => {});
  sub.on('status', () => {});

  sub.on('block', data => {
    equal(data.id.length, 64, 'Block id emitted');
    equal(data.height + 1, confs, 'Block height emitted');

    blockEmitter.emit('data', {
      hash: Buffer.from(data.id, 'hex'),
      height: data.height + 1,
    });

    confs--;

    if (!!confs) {
      return;
    }

    sub.removeAllListeners();

    return end();
  });

  return;
});

tests.forEach(({args, description, expected}) => {
  return test(description, (t, end) => {
    const events = [];
    const sub = subscribeToBlocks(args);

    sub.on('error', err => {
      events.push(err);

      sub.removeAllListeners();

      deepEqual(events, expected.events, 'Got expected events');

      return end();
    });

    sub.on('block', block => {
      events.push(block);

      if (events.length !== expected.events.length) {
        return;
      }

      sub.removeAllListeners();

      deepEqual(events, expected.events, 'Got expected events');

      return end();
    });

    return;
  });
});

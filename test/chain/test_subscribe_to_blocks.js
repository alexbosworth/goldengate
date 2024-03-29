const {equal} = require('node:assert').strict;
const EventEmitter = require('node:events');
const test = require('node:test');
const {throws} = require('node:assert').strict;

const {subscribeToBlocks} = require('./../../');

const api = 'https://blockstream.info/testnet/api/block';
const confirmationCount = 6;
const network = 'btctestnet';
const okStatus = {statusCode: 200};

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

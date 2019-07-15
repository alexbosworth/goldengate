const EventEmitter = require('events');
const {readFileSync} = require('fs');

const {test} = require('tap');

const {subscribeToBlocks} = require('./../../chain');

const api = 'https://blockstream.info/testnet/api/block';
const confirmationCount = 6;
const network = 'btctestnet';
const okStatus = {statusCode: 200};

// Subscribers to blocks should receive block notifications
test(`Subscribe to blocks`, ({end, equal, fail}) => {
  let confs = confirmationCount;

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

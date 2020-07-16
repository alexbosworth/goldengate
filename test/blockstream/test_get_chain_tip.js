const {test} = require('@alexbosworth/tap');

const {getChainTip} = require('./../../blockstream');

const hash = Buffer.alloc(32).toString('hex');

const tests = [
  {
    args: {
      network: 'btctestnet',
      request: ({url}, cbk) => {
        switch (url) {
          case 'https://blockstream.info/testnet/api/blocks/tip/hash':
            return cbk(null, {statusCode: 200}, hash);

          case `https://blockstream.info/testnet/api/block/${hash}`:
            return cbk(null, {statusCode: 200}, {height: 1});

          default:
            return cbk(new Error('UnexpedtedUrlWhenTestingGetChainTip'));
        }
      },
    },
    description: 'Get chain tip',
    expected: {height: 1, id: hash},
  },
];

tests.forEach(({args, description, expected}) => {
  return test(description, ({equal, end}) => {
    return getChainTip(args, (err, res) => {
      equal(err, null, 'No error getting chain tip');

      equal(res.height, expected.height, 'Got chain tip height');
      equal(res.id, expected.id, 'Got chain tip block id');

      return end();
    });
  });
});

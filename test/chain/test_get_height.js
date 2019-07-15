const {test} = require('tap');

const {getHeight} = require('./../../');

const tests = [
  {
    args: {
      network: 'btctestnet',
      request: ({url}, cbk) => {
        switch (url) {
          case 'https://blockstream.info/testnet/api/blocks/tip/height':
            return cbk(null, {statusCode: 200}, '100');

          default:
            return cbk(new Error('UnexpedtedUrlWhenTestingGetChainTipHeight'));
        }
      },
    },
    description: 'Get chain height',
    expected: {height: 100},
  },
];

tests.forEach(({args, description, expected}) => {
  return test(description, ({equal, end}) => {
    return getHeight(args, (err, res) => {
      equal(err, null, 'No error getting chain height');
      equal(res.height, 100, 'Got chain height');

      return end();
    });
  });
});

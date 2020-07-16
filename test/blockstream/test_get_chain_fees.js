const {test} = require('@alexbosworth/tap');

const {getChainFees} = require('./../../blockstream');

const tests = [
  {
    args: {
      network: 'btctestnet',
      request: ({url}, cbk) => {
        switch (url) {
          case 'https://blockstream.info/testnet/api/fee-estimates':
            return cbk(null, {statusCode: 200}, {'6': 1});

          default:
            return cbk(new Error('UnexpedtedUrlWhenTestingGetChainFees'));
        }
      },
    },
    description: 'Get chain fees',
    expected: {fees: {'6': 1}},
  },
];

tests.forEach(({args, description, expected}) => {
  return test(description, ({equal, end}) => {
    return getChainFees(args, (err, res) => {
      equal(err, null, 'No error getting chain fees');

      equal(res.fees['6'], expected.fees['6'], 'Got chain fee');

      return end();
    });
  });
});

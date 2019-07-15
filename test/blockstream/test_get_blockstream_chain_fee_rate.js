const {test} = require('tap');

const {getBlockstreamChainFeeRate} = require('./../../blockstream');

const tests = [
  {
    args: {
      confirmation_target: 7,
      network: 'btctestnet',
      request: ({}, cbk) => cbk(null, {statusCode: 200}, {'6': 5}),
    },
    description: 'Get chain fee rate from Blockstream',
    expected: 5,
  },
];

tests.forEach(({args, description, expected}) => {
  return test(description, ({equal, end}) => {
    return getBlockstreamChainFeeRate(args, (err, res) => {
      equal(err, null, 'No error getting blockstream chain fee rate');

      equal(res.tokens_per_vbyte, expected, 'Got blockstream chain fee rate');

      return end();
    });
  });
});

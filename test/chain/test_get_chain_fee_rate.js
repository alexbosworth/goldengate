const {test} = require('tap');

const {getChainFeeRate} = require('./../../chain');

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
  {
    args: {
      confirmation_target: 6,
      lnd: {
        wallet: {estimateFee: ({}, cbk) => cbk(null, {sat_per_kw: 5000/4})},
      },
    },
    description: 'Get chain fee rate from lnd',
    expected: 5,
  },
];

tests.forEach(({args, description, expected}) => {
  return test(description, ({equal, end}) => {
    return getChainFeeRate(args, (err, res) => {
      equal(err, null, 'No error getting chain fee rate');

      equal(res.tokens_per_vbyte, expected, 'Got chain fee rate');

      return end();
    });
  });
});

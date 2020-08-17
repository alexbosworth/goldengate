const {test} = require('tap');

const {getChainFeeRate} = require('./../../chain');

const tests = [
  {
    args: {},
    description: 'A confirmation target is required',
    error: [400, 'ExpectedConfirmationTargetToGetChainFeeRate'],
  },
  {
    args: {confirmation_target: 1},
    description: 'A request method is required',
    error: [400, 'ExpectedRequestFunctionOrLndObjToGetChainFeeRate'],
  },
  {
    args: {confirmation_target: 1, request: ({}, cbk) => cbk()},
    description: 'A network is required',
    error: [400, 'ExpectedNetworkToGetChainFeeRate'],
  },
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

tests.forEach(({args, description, error, expected}) => {
  return test(description, async ({equal, end, rejects}) => {
    if (!!error) {
      rejects(getChainFeeRate(args), error, 'Got expected error');

      return end();
    }

    const rate = await getChainFeeRate(args);

    equal(rate.tokens_per_vbyte, expected, 'Got chain fee rate');

    return end();
  });
});

const {deepEqual} = require('node:assert').strict;
const {rejects} = require('node:assert').strict;
const test = require('node:test');

const {getChainFees} = require('./../../blockstream');

const tests = [
  {
    args: {request: ({url}, cbk) => cbk('err')},
    description: 'Network is required',
    error: [400, 'ExpectedKnownNetworkToGetFeeEstimates'],
  },
  {
    args: {network: 'btctestnet'},
    description: 'Request function is required',
    error: [400, 'ExpectedRequestToGetFeeEstimates'],
  },
  {
    args: {network: 'btctestnet', request: ({url}, cbk) => cbk('err')},
    description: 'Get chain fee errors are passed back',
    error: [503, 'UnexpectedErrorGettingFeeEstimates'],
  },
  {
    args: {network: 'btctestnet', request: ({url}, cbk) => cbk()},
    description: 'Get chain fee response is expected',
    error: [503, 'UnexpectedStatusCodeGettingFeeEstimates'],
  },
  {
    args: {network: 'btctestnet', request: ({url}, cbk) => cbk(null, {})},
    description: 'Get chain fee response status is expected',
    error: [503, 'UnexpectedStatusCodeGettingFeeEstimates'],
  },
  {
    args: {
      network: 'btctestnet',
      request: ({url}, cbk) => cbk(null, {statusCode: 200}),
    },
    description: 'Chain fee response is expected',
    error: [503, 'ExpectedFeesFromFeeEstimatesApi'],
  },
  {
    args: {
      network: 'btctestnet',
      request: ({url}, cbk) => cbk(null, {statusCode: 200}, {}),
    },
    description: 'Chain fee response normal fee target is expected',
    error: [503, 'ExpectedNormalFeeEstimateInFeeEstimatesApi'],
  },
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

tests.forEach(({args, description, error, expected}) => {
  return test(description, async () => {
    if (!!error) {
      await rejects(getChainFees(args), error, 'Got expected error');
    } else {
      const {fees} = await getChainFees(args);

      deepEqual(fees, expected.fees, 'Got expected fees');
    }

    return;
  });
});

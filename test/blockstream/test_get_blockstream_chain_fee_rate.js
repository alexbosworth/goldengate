const {equal} = require('node:assert').strict;
const {rejects} = require('node:assert').strict;
const test = require('node:test');

const {getBlockstreamChainFeeRate} = require('./../../blockstream');

const makeArgs = override => {
  const args = {
    confirmation_target: 7,
    network: 'btctestnet',
    request: ({}, cbk) => cbk(null, {statusCode: 200}, {'4': 7, '6': 5}),
  };

  Object.keys(override).forEach(key => args[key] = override[key]);

  return args;
}

const tests = [
  {
    args: makeArgs({confirmation_target: undefined}),
    description: 'A confirmation target is required',
    error: [400, 'ExpectedConfTargetToGetBlockstreamFeeRate'],
  },
  {
    args: makeArgs({confirmation_target: 1}),
    description: 'A confirmation target above 1 is required',
    error: [400, 'ExpectedMinConfTargetToGetBlockstreamFeeRate'],
  },
  {
    args: makeArgs({network: undefined}),
    description: 'A network is required',
    error: [400, 'ExpectedNetworkToGetBlockstreamFeeRate'],
  },
  {
    args: makeArgs({request: undefined}),
    description: 'A request function is required',
    error: [400, 'ExpectedRequestFunctionToGetBlockstreamFeeRate'],
  },
  {
    args: makeArgs({request: ({}, cbk) => cbk('err')}),
    description: 'Errors are passed back',
    error: [503, 'UnexpectedErrorGettingFeeEstimates', {err: 'err'}],
  },
  {
    args: makeArgs({
      confirmation_target: 2,
      request: ({}, cbk) => cbk(null, {statusCode: 200}, {'6': 1}),
    }),
    description: 'Fees are expected',
    error: [503, 'FailedToFindConfirmationTarget'],
  },
  {
    args: makeArgs({}),
    description: 'Get chain fee rate from Blockstream',
    expected: 5,
  },
];

tests.forEach(({args, description, error, expected}) => {
  return test(description, async () => {
    if (!!error) {
      await rejects(getBlockstreamChainFeeRate(args), error, 'Got error');
    } else {
      const rate = await getBlockstreamChainFeeRate(args);

      equal(rate.tokens_per_vbyte, expected, 'Got blockstream chain fee rate');
    }

    return;
  });
});

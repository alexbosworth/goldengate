const {test} = require('tap');

const {getSwapInQuote} = require('./../../lightninglabs');

const makeArgs = overrides => {
  const args = {
    metadata: {},
    service: {
      loopInQuote: ({}, _, cbk) => cbk(null, {cltv_delta: 5, swap_fee: '1'}),
    },
    tokens: 1,
  };

  Object.keys(overrides).forEach(k => args[k] = overrides[k]);

  return args;
};

const tests = [
  {
    args: makeArgs({metadata: undefined}),
    description: 'Metadata is required',
    error: [400, 'ExpectedAuthenticationMetadataToGetSwapInQuote'],
  },
  {
    args: makeArgs({service: undefined}),
    description: 'Swap service is required to get a swap in quote',
    error: [400, 'ExpectedServiceToGetSwapInQuote'],
  },
  {
    args: makeArgs({service: {}}),
    description: 'Swap service with swap method is required',
    error: [400, 'ExpectedServiceToGetSwapInQuote'],
  },
  {
    args: makeArgs({tokens: undefined}),
    description: 'Tokens are required',
    error: [400, 'ExpectedTokensAmountToGetSwapInQuote'],
  },
  {
    args: makeArgs({service: {loopInQuote: ({}, {}, cbk) => cbk()}}),
    description: 'A response is expected from the swap service',
    error: [503, 'ExpectedResponseWhenGettingSwapInQuote'],
  },
  {
    args: makeArgs({service: {loopInQuote: ({}, {}, cbk) => cbk('err')}}),
    description: 'Errors are passed back',
    error: [503, 'UnexpectedErrorGettingSwapInQuote', {err: 'err'}],
  },
  {
    args: makeArgs({service: {loopInQuote: ({}, {}, cbk) => cbk()}}),
    description: 'A response is expected',
    error: [503, 'ExpectedResponseWhenGettingSwapInQuote'],
  },
  {
    args: makeArgs({service: {loopInQuote: ({}, {}, cbk) => cbk(null, {})}}),
    description: 'A cltv is expected',
    error: [503, 'ExpectedCltvDeltaInSwapInQuoteResponse'],
  },
  {
    args: makeArgs({
      service: {loopInQuote: ({}, {}, cbk) => cbk(null, {cltv_delta: 1})},
    }),
    description: 'A swap fee is expected',
    error: [503, 'ExpectedSwapFeeBaseRateInSwapInQuoteResponse'],
  },
  {
    args: makeArgs({}),
    description: 'Get a swap in quote',
    expected: {cltv_delta: 5, fee: 1},
  },
];

tests.forEach(({args, description, error, expected}) => {
  return test(description, async ({equal, end, rejects}) => {
    if (!!error) {
      await rejects(getSwapInQuote(args), error, 'Got expected error');
    } else {
      const res = await getSwapInQuote(args);

      equal(res.fee, expected.fee, 'Swap in quote fee');
      equal(res.cltv_delta, expected.cltv_delta, 'Swap in quote cltv delta');
    }

    return end();
  });
});

const {test} = require('@alexbosworth/tap');

const {getSwapInQuote} = require('./../../lightninglabs');

const tests = [
  {
    args: {},
    description: 'Swap service is required to get a swap in quote',
    error: [400, 'ExpectedServiceToGetSwapInQuote'],
  },
  {
    args: {service: {}},
    description: 'Swap service with swap method is required',
    error: [400, 'ExpectedServiceToGetSwapInQuote'],
  },
  {
    args: {service: {loopInQuote: ({}, {}, cbk) => cbk()}},
    description: 'Swap service with swap method is required',
    error: [400, 'ExpectedTokensAmountToGetSwapInQuote'],
  },
  {
    args: {service: {loopInQuote: ({}, {}, cbk) => cbk('err')}, tokens: 1},
    description: 'Errors are passed back',
    error: [503, 'UnexpectedErrorGettingSwapInQuote', {err: 'err'}],
  },
  {
    args: {service: {loopInQuote: ({}, {}, cbk) => cbk()}, tokens: 1},
    description: 'A response is expected',
    error: [503, 'ExpectedResponseWhenGettingSwapInQuote'],
  },
  {
    args: {service: {loopInQuote: ({}, {}, cbk) => cbk(null, {})}, tokens: 1},
    description: 'A cltv is expected',
    error: [503, 'ExpectedCltvDeltaInSwapInQuoteResponse'],
  },
  {
    args: {
      service: {loopInQuote: ({}, {}, cbk) => cbk(null, {cltv_delta: 1})},
      tokens: 1,
    },
    description: 'A swap fee is expected',
    error: [503, 'ExpectedSwapFeeBaseRateInSwapInQuoteResponse'],
  },
  {
    args: {
      service: {
        loopInQuote: ({}, _, cbk) => cbk(null, {cltv_delta: 5, swap_fee: '1'}),
      },
      tokens: 1,
    },
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

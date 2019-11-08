const {test} = require('tap');

const {getSwapInTerms} = require('./../../');

const tests = [
  {
    args: {},
    description: 'Expected swap service to get swap in terms',
    error: [400, 'ExpectedServiceToGetSwapInTerms'],
  },
  {
    args: {service: {}},
    description: 'Expected swap service with loop in method to get terms',
    error: [400, 'ExpectedServiceToGetSwapInTerms'],
  },
  {
    args: {service: {loopInTerms: ({}, cbk) => cbk('err')}},
    description: 'Error returned from loop in',
    error: [503, 'UnexpectedErrorGettingSwapInTerms', {err: 'err'}],
  },
  {
    args: {service: {loopInTerms: ({}, cbk) => cbk()}},
    description: 'Result expected in swap in terms',
    error: [503, 'ExpectedResponseWhenGettingSwapInTerms'],
  },
  {
    args: {service: {loopInTerms: ({}, cbk) => cbk(null, {})}},
    description: 'Max swap amount expected in terms response',
    error: [503, 'ExpectedMaxSwapAmountInSwapInTermsResponse'],
  },
  {
    args: {service: {loopInTerms: ({}, cbk) => cbk(null, {
      max_swap_amount: '2',
    })}},
    description: 'Min swap amount expected in terms response',
    error: [503, 'ExpectedMinSwapAmountInSwapInTermsResponse'],
  },
  {
    args: {
      service: {
        loopInTerms: ({}, cbk) => cbk(null, {
          max_swap_amount: '2',
          min_swap_amount: '1',
        }),
      },
    },
    description: 'Get a swap in terms',
    expected: {max_tokens: 2, min_tokens: 1},
  },
];

tests.forEach(({args, description, error, expected}) => {
  return test(description, async ({equal, end, rejects}) => {
    if (!!error) {
      rejects(getSwapInTerms(args), error, 'Got expected error');
    } else {
      const res = await getSwapInTerms(args);

      equal(res.max_tokens, expected.max_tokens, 'Swap in max tokens');
      equal(res.min_tokens, expected.min_tokens, 'Swap in min tokens');
    }

    return end();
  });
});

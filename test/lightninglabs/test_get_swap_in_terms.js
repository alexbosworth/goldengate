const {equal} = require('node:assert').strict;
const {rejects} = require('node:assert').strict;
const test = require('node:test');

const {getSwapInTerms} = require('./../../');

const makeArgs = overrides => {
  const args = {
    metadata: {},
    service: {
      loopInTerms: ({}, {}, cbk) => cbk(null, {
        max_swap_amount: '2',
        min_swap_amount: '1',
      }),
    },
  };

  Object.keys(overrides).forEach(k => args[k] = overrides[k]);

  return args;
};

const tests = [
  {
    args: makeArgs({metadata: undefined}),
    description: 'Expected service metadata to get swap in terms',
    error: [400, 'ExpectedAuthenticationMetadataToGetSwapInTerms'],
  },
  {
    args: makeArgs({service: undefined}),
    description: 'Expected swap service to get swap in terms',
    error: [400, 'ExpectedServiceToGetSwapInTerms'],
  },
  {
    args: makeArgs({service: {}}),
    description: 'Expected swap service with loop in method to get terms',
    error: [400, 'ExpectedServiceToGetSwapInTerms'],
  },
  {
    args: makeArgs({service: {loopInTerms: ({}, {}, cbk) => cbk('err')}}),
    description: 'Error returned from loop in',
    error: [503, 'UnexpectedErrorGettingSwapInTerms', {err: 'err'}],
  },
  {
    args: makeArgs({service: {loopInTerms: ({}, {}, cbk) => cbk()}}),
    description: 'Result expected in swap in terms',
    error: [503, 'ExpectedResponseWhenGettingSwapInTerms'],
  },
  {
    args: makeArgs({service: {loopInTerms: ({}, {}, cbk) => cbk(null, {})}}),
    description: 'Max swap amount expected in terms response',
    error: [503, 'ExpectedMaxSwapAmountInSwapInTermsResponse'],
  },
  {
    args: makeArgs({service: {loopInTerms: ({}, {}, cbk) => cbk(null, {
      max_swap_amount: '2',
    })}}),
    description: 'Min swap amount expected in terms response',
    error: [503, 'ExpectedMinSwapAmountInSwapInTermsResponse'],
  },
  {
    args: makeArgs({}),
    description: 'Get a swap in terms',
    expected: {max_tokens: 2, min_tokens: 1},
  },
];

tests.forEach(({args, description, error, expected}) => {
  return test(description, async () => {
    if (!!error) {
      await rejects(getSwapInTerms(args), error, 'Got expected error');
    } else {
      const res = await getSwapInTerms(args);

      equal(res.max_tokens, expected.max_tokens, 'Swap in max tokens');
      equal(res.min_tokens, expected.min_tokens, 'Swap in min tokens');
    }

    return;
  });
});

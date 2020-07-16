const {test} = require('@alexbosworth/tap');

const {getSwapOutTerms} = require('./../../');

const tests = [
  {
    args: {},
    description: 'Expected swap service to get swap in terms',
    error: [400, 'ExpectedServiceToGetSwapOutTerms'],
  },
  {
    args: {service: {}},
    description: 'Expected swap service with terms api to get swap in terms',
    error: [400, 'ExpectedServiceToGetSwapOutTerms'],
  },
  {
    args: {service: {loopOutTerms: ({}, {}, cbk) => cbk('err')}},
    description: 'Errors are passed back',
    error: [503, 'UnexpectedErrorGettingSwapTerms', {err: 'err'}],
  },
  {
    args: {service: {loopOutTerms: ({}, {}, cbk) => cbk()}},
    description: 'A response is expected',
    error: [503, 'ExpectedResponseWhenGettingSwapTerms'],
  },
  {
    args: {service: {loopOutTerms: ({}, {}, cbk) => cbk(null, {})}},
    description: 'A max swap amount is expected',
    error: [503, 'ExpectedMaxSwapAmountInSwapTermsResponse'],
  },
  {
    args: {service: {loopOutTerms: ({}, {}, cbk) => cbk(null, {
      max_swap_amount: '1',
    })}},
    description: 'A min swap amount is expected',
    error: [503, 'ExpectedMinSwapAmountInSwapTermsResponse'],
  },
  {
    args: {service: {loopOutTerms: ({}, {}, cbk) => cbk(null, {
      max_swap_amount: '2',
      min_swap_amount: '1',
    })}},
    description: 'A min swap amount is expected',
    expected: {max_tokens: 2, min_tokens: 1},
  },
];

tests.forEach(({args, description, error, expected}) => {
  return test(description, async ({equal, end, rejects}) => {
    if (!!error) {
      rejects(getSwapOutTerms(args), error, 'Got expected error');
    } else {
      const res = await getSwapOutTerms(args);

      equal(res.max_tokens, expected.max_tokens, 'Swap in max tokens');
      equal(res.min_tokens, expected.min_tokens, 'Swap in min tokens');
    }

    return end();
  });
});

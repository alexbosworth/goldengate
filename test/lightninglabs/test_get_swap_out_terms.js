const {test} = require('tap');

const {loopOutTermsResponse} = require('./fixtures');
const {getSwapOutTerms} = require('./../../');

const copyJson = json => JSON.parse(JSON.stringify(json));

const makeResponse = overrides => {
  const response = copyJson(loopOutTermsResponse);

  Object.keys(overrides).forEach(k => response[k] = overrides[k]);

  return response;
};

const makeService = ({overrides}) => {
  return {
    loopOutTerms: ({}, {}, cbk) => cbk(null, makeResponse(overrides || {})),
  }
};

const makeArgs = overrides => {
  const args = {metadata: {}, service: makeService({})};

  Object.keys(overrides).forEach(k => args[k] = overrides[k]);

  return args;
};

const tests = [
  {
    args: makeArgs({metadata: undefined}),
    description: 'Expected metadata to get swap in terms',
    error: [400, 'ExpectedAuthenticationMetadataToGetSwapOutTerms'],
  },
  {
    args: makeArgs({service: undefined}),
    description: 'Expected swap service to get swap in terms',
    error: [400, 'ExpectedServiceToGetSwapOutTerms'],
  },
  {
    args: makeArgs({service: {}}),
    description: 'Expected swap service with terms api to get swap in terms',
    error: [400, 'ExpectedServiceToGetSwapOutTerms'],
  },
  {
    args: makeArgs({service: {loopOutTerms: ({}, {}, cbk) => cbk('err')}}),
    description: 'Errors are passed back',
    error: [503, 'UnexpectedErrorGettingSwapTerms', {err: 'err'}],
  },
  {
    args: makeArgs({
      service: {
        loopOutTerms: ({}, {}, cbk) => cbk({
          message: '14 UNAVAILABLE: No connection established',
        }),
      },
    }),
    description: 'A connection failure returns a connection error',
    error: [503, 'FailedToConnectToService'],
  },
  {
    args: makeArgs({service: {loopOutTerms: ({}, {}, cbk) => cbk()}}),
    description: 'A response is expected',
    error: [503, 'ExpectedResponseWhenGettingSwapTerms'],
  },
  {
    args: makeArgs({
      service: makeService({overrides: {max_cltv_delta: undefined}}),
    }),
    description: 'A max swap cltv delta value is expected',
    error: [503, 'ExpectedMaxCltvDeltaInSwapTermsResponse'],
  },
  {
    args: makeArgs({
      service: makeService({overrides: {max_swap_amount: undefined}}),
    }),
    description: 'A max swap amount is expected',
    error: [503, 'ExpectedMaxSwapAmountInSwapTermsResponse'],
  },
  {
    args: makeArgs({
      service: makeService({overrides: {min_cltv_delta: undefined}}),
    }),
    description: 'A min cltv delta is expected',
    error: [503, 'ExpectedMinCltvDeltaInSwapTermsResponse'],
  },
  {
    args: makeArgs({
      service: makeService({overrides: {min_swap_amount: undefined}}),
    }),
    description: 'A min swap amount is expected',
    error: [503, 'ExpectedMinSwapAmountInSwapTermsResponse'],
  },
  {
    args: makeArgs({}),
    description: 'Get swap out terms returns swap out terms',
    expected: {
      max_cltv_delta: 2,
      max_tokens: 2,
      min_cltv_delta: 1,
      min_tokens: 1,
    },
  },
];

tests.forEach(({args, description, error, expected}) => {
  return test(description, async ({equal, end, rejects}) => {
    if (!!error) {
      await rejects(getSwapOutTerms(args), error, 'Got expected error');
    } else {
      const res = await getSwapOutTerms(args);

      equal(res.max_cltv_delta, expected.max_cltv_delta, 'Swap out max cltv');
      equal(res.max_tokens, expected.max_tokens, 'Swap out max tokens');
      equal(res.min_cltv_delta, expected.min_cltv_delta, 'Swap out min cltv');
      equal(res.min_tokens, expected.min_tokens, 'Swap out min tokens');
    }

    return end();
  });
});

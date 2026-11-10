const {deepEqual} = require('node:assert').strict;
const {rejects} = require('node:assert').strict;
const test = require('node:test');

const {getSwapInQuote} = require('./../../lightninglabs');

// A swap service that checks the version and shared address fields of quotes
const makeService = ({fast, fee, utxosCount}) => ({
  loopInQuote: (args, {}, cbk) => {
    if (args.protocol_version !== 'MUSIG2') {
      return cbk([400, 'InvalidProtocolVersionSpecified']);
    }

    if (args.fast !== fast) {
      return cbk([400, 'UnexpectedFastFlagInQuoteRequest']);
    }

    if (args.num_static_address_deposits !== utxosCount) {
      return cbk([400, 'UnexpectedUtxosCountInQuoteRequest']);
    }

    return cbk(null, {cltv_delta: 5, swap_fee: fee});
  },
});

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
    args: makeArgs({utxos_count: 1.5}),
    description: 'A whole number of shared address utxos is expected',
    error: [400, 'ExpectedUtxosCountNumberToGetSwapInQuote'],
  },
  {
    args: makeArgs({utxos_count: 0}),
    description: 'A positive number of shared address utxos is expected',
    error: [400, 'ExpectedPositiveUtxosCountToGetSwapInQuote'],
  },
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
  {
    args: makeArgs({service: makeService({fee: '1'})}),
    description: 'A regular swap in quote has no shared address fields',
    expected: {cltv_delta: 5, fee: 1},
  },
  {
    args: makeArgs({
      is_fast: true,
      service: makeService({fast: true, fee: '2', utxosCount: 3}),
      utxos_count: 3,
    }),
    description: 'Get a swap in quote for shared address utxos',
    expected: {cltv_delta: 5, fee: 2},
  },
];

tests.forEach(({args, description, error, expected}) => {
  return test(description, async () => {
    if (!!error) {
      await rejects(getSwapInQuote(args), error, 'Got expected error');
    } else {
      deepEqual(await getSwapInQuote(args), expected, 'Got expected quote');
    }

    return;
  });
});

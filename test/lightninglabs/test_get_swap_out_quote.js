const {test} = require('tap');

const {getSwapOutQuote} = require('./../../lightninglabs');

const makeArgs = override => {
  const args = {
    service: {
      loopOutQuote: (args, {}, cbk) => {
        if (args.protocol_version !== 'USER_EXPIRY_LOOP_OUT') {
          return cbk([400, 'InvalidProtocolVersionSpecified']);
        }

        return cbk(null, {
          cltv_delta: 1,
          prepay_amt: '1',
          swap_fee: '1',
          swap_payment_dest: Buffer.alloc(33).toString('hex'),
        });
      },
    },
    timeout: 1,
    tokens: 1,
  };

  Object.keys(override).forEach(key => args[key] = override[key]);

  return args;
};

const tests = [
  {
    args: makeArgs({}),
    description: 'Get a swap quote',
    expected: {
      cltv_delta: 1,
      deposit: 1,
      destination: Buffer.alloc(33).toString('hex'),
      fee: 1,
    },
  },
  {
    args: makeArgs({delay: new Date().toISOString()}),
    description: 'Get a swap quote with a delay',
    expected: {
      cltv_delta: 1,
      deposit: 1,
      destination: Buffer.alloc(33).toString('hex'),
      fee: 1,
    },
  },
  {
    args: makeArgs({service: undefined}),
    description: 'Swap out quote requires swap service',
    error: [400, 'ExpectedServiceToGetSwapOutQuote'],
  },
  {
    args: makeArgs({timeout: undefined}),
    description: 'Swap out quote requires timeout',
    error: [400, 'ExpectedTimeoutToGetSwapOutQuote'],
  },
  {
    args: makeArgs({tokens: undefined}),
    description: 'Swap out quote requires tokens',
    error: [400, 'ExpectedTokensToGetSwapOutQuote'],
  },
  {
    args: makeArgs({service: {loopOutQuote: ({}, {}, cbk) => cbk('error')}}),
    description: 'Unexpected connection error from service returns error',
    error: [503, 'UnexpectedErrorGettingSwapQuote', {err: 'error'}],
  },
  {
    args: makeArgs({service: {loopOutQuote: ({}, {}, cbk) => cbk()}}),
    description: 'Unexpected empty response from service returns error',
    error: [503, 'ExpectedResponseWhenGettingSwapQuote'],
  },
  {
    args: makeArgs({service: {loopOutQuote: ({}, {}, cbk) => cbk(null, {})}}),
    description: 'A cltv is expected in response',
    error: [503, 'ExpectedCltvDeltaInSwapQuoteResponse'],
  },
  {
    args: makeArgs({
      service: {loopOutQuote: ({}, {}, cbk) => cbk(null, {cltv_delta: 1})}
    }),
    description: 'A prepay amount is expected in response',
    error: [503, 'ExpectedPrepayAmountInSwapQuoteResponse'],
  },
  {
    args: makeArgs({
      service: {
        loopOutQuote: ({}, {}, cbk) => cbk(null, {
          cltv_delta: 1,
          prepay_amt: '1',
        }),
      },
    }),
    description: 'A swap fee is expected in response',
    error: [503, 'ExpectedSwapFeeAmountInSwapQuoteResponse'],
  },
  {
    args: makeArgs({
      service: {
        loopOutQuote: ({}, {}, cbk) => cbk(null, {
          cltv_delta: 1,
          prepay_amt: '1',
          swap_fee: '1',
        }),
      },
    }),
    description: 'A payment destination public key is expected in response',
    error: [503, 'ExpectedSwapPaymentDestinationPublicKey'],
  },
];

tests.forEach(({args, description, error, expected}) => {
  return test(description, async ({equal, end, rejects}) => {
    if (!!error) {
      rejects(getSwapOutQuote(args), error, 'Got expected error');

      return end();
    }

    const quote = await getSwapOutQuote(args);

    equal(quote.cltv_delta, expected.cltv_delta, 'Swap quote cltv delta');
    equal(quote.deposit, expected.deposit, 'Swap quote deposit');
    equal(quote.destination, expected.destination, 'Swap quote destination');
    equal(quote.fee, expected.fee, 'Swap quote fee');

    return end();
  });
});

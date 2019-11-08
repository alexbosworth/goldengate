const {test} = require('tap');

const {getSwapOutQuote} = require('./../../lightninglabs');

const tests = [
  {
    args: {
      service: {
        loopOutQuote: ({}, cbk) => {
          return cbk(null, {
            cltv_delta: 1,
            prepay_amt: '1',
            swap_fee: '1',
            swap_payment_dest: Buffer.alloc(33).toString('hex'),
          });
        },
      },
      tokens: 1,
    },
    description: 'Get a swap quote',
    expected: {
      cltv_delta: 1,
      deposit: 1,
      destination: Buffer.alloc(33).toString('hex'),
      fee: 1,
    },
  },
  {
    args: {},
    description: 'Swap out quote requires swap service',
    error: [400, 'ExpectedServiceToGetSwapOutQuote'],
  },
  {
    args: {service: {loopOutQuote: () => {}}},
    description: 'Swap out quote requires tokens',
    error: [400, 'ExpectedTokensToGetSwapOutQuote'],
  },
  {
    args: {service: {loopOutQuote: ({}, cbk) => cbk('error')}, tokens: 1},
    description: 'Unexpected connection error from service returns error',
    error: [503, 'UnexpectedErrorGettingSwapQuote', {err: 'error'}],
  },
  {
    args: {service: {loopOutQuote: ({}, cbk) => cbk()}, tokens: 1},
    description: 'Unexpected empty response from service returns error',
    error: [503, 'ExpectedResponseWhenGettingSwapQuote'],
  },
  {
    args: {service: {loopOutQuote: ({}, cbk) => cbk(null, {})}, tokens: 1},
    description: 'A cltv is expected in response',
    error: [503, 'ExpectedCltvDeltaInSwapQuoteResponse'],
  },
  {
    args: {
      service: {loopOutQuote: ({}, cbk) => cbk(null, {cltv_delta: 1})},
      tokens: 1,
    },
    description: 'A prepay amount is expected in response',
    error: [503, 'ExpectedPrepayAmountInSwapQuoteResponse'],
  },
  {
    args: {
      service: {loopOutQuote: ({}, cbk) => cbk(null, {
        cltv_delta: 1,
        prepay_amt: '1',
      })},
      tokens: 1,
    },
    description: 'A swap fee is expected in response',
    error: [503, 'ExpectedSwapFeeAmountInSwapQuoteResponse'],
  },
  {
    args: {
      service: {loopOutQuote: ({}, cbk) => cbk(null, {
        cltv_delta: 1,
        prepay_amt: '1',
        swap_fee: '1',
      })},
      tokens: 1,
    },
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

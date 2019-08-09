const {test} = require('tap');

const {getSwapOutQuote} = require('./../../lightninglabs');

const tests = [
  {
    args: {
      service: {
        loopOutQuote: ({}, cbk) => {
          return cbk(null, {
            cltv_delta: 1,
            max_swap_amount: '1',
            min_swap_amount: '1',
            prepay_amt: '1',
            swap_fee_base: '1',
            swap_fee_rate: '1',
            swap_payment_dest: Buffer.alloc(33).toString('hex'),
          });
        },
      },
    },
    description: 'Get a swap quote',
    expected: {
      base_fee: 1,
      cltv_delta: 1,
      deposit: 1,
      destination: Buffer.alloc(33).toString('hex'),
      fee_rate: 1,
      max_tokens: 1,
      min_tokens: 1,
    },
  },
  {
    args: {},
    description: 'Swap out quote requires swap service',
    error: [400, 'ExpectedServiceToGetSwapQuote'],
  },
  {
    args: {service: {loopOutQuote: ({}, cbk) => cbk('error')}},
    description: 'Unexpected connection error from service returns error',
    error: [503, 'UnexpectedErrorGettingSwapQuote', {err: 'error'}],
  },
  {
    args: {service: {loopOutQuote: ({}, cbk) => cbk()}},
    description: 'Unexpected empty response from service returns error',
    error: [503, 'ExpectedResponseWhenGettingSwapQuote'],
  },
];

tests.forEach(({args, description, error, expected}) => {
  return test(description, async ({equal, end, rejects}) => {
    if (!!error) {
      rejects(getSwapOutQuote(args), error, 'Got expected error');

      return end();
    }

    const quote = await getSwapOutQuote(args);

    equal(quote.base_fee, expected.base_fee, 'Swap quote base fee');
    equal(quote.cltv_delta, expected.cltv_delta, 'Swap quote cltv delta');
    equal(quote.deposit, expected.deposit, 'Swap quote deposit');
    equal(quote.destination, expected.destination, 'Swap quote destination');
    equal(quote.fee_rate, expected.fee_rate, 'Swap quote fee rate');
    equal(quote.max_tokens, expected.max_tokens, 'Swap quote max tokens');
    equal(quote.min_tokens, expected.min_tokens, 'Swap quote min tokens');

    return end();
  });
});

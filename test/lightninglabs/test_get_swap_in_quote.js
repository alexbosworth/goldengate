const {test} = require('tap');

const {getSwapInQuote} = require('./../../lightninglabs');

const tests = [
  {
    args: {
      service: {
        loopInQuote: ({}, cbk) => {
          return cbk(null, {
            swap_fee_base: '1',
            swap_fee_rate: '2',
            min_swap_amount: '3',
            max_swap_amount: '4',
            cltv_delta: 5,
          });
        },
      },
    },
    description: 'Get a swap in quote',
    expected: {
      base_fee: 1,
      cltv_delta: 5,
      fee_rate: 2,
      max_tokens: 4,
      min_tokens: 3,
    },
  },
];

tests.forEach(({args, description, expected}) => {
  return test(description, async ({equal, end}) => {
    const res = await getSwapInQuote(args);

    equal(res.base_fee, expected.base_fee, 'Swap in quote base fee');
    equal(res.cltv_delta, expected.cltv_delta, 'Swap in quote cltv delta');
    equal(res.fee_rate, expected.fee_rate, 'Swap quote fee rate');
    equal(res.max_tokens, expected.max_tokens, 'Swap quote max tokens');
    equal(res.min_tokens, expected.min_tokens, 'Swap quote min tokens');

    return end();
  });
});

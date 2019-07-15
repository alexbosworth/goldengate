const {test} = require('tap');

const {getSwapQuote} = require('./../../lightninglabs');

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
];

tests.forEach(({args, description, expected}) => {
  return test(description, ({equal, end}) => {
    return getSwapQuote(args, (err, res) => {
      equal(err, null, 'No error getting swap quote');

      equal(res.base_fee, expected.base_fee, 'Swap quote base fee');
      equal(res.cltv_delta, expected.cltv_delta, 'Swap quote cltv delta');
      equal(res.deposit, expected.deposit, 'Swap quote deposit');
      equal(res.destination, expected.destination, 'Swap quote destination');
      equal(res.fee_rate, expected.fee_rate, 'Swap quote fee rate');
      equal(res.max_tokens, expected.max_tokens, 'Swap quote max tokens');
      equal(res.min_tokens, expected.min_tokens, 'Swap quote min tokens');

      return end();
    });
  });
});

const {equal} = require('node:assert').strict;
const test = require('node:test');
const {throws} = require('node:assert').strict;

const {swapInFee} = require('./../../');

const tests = [
  {
    args: {base_fee: 1337, fee_rate: 21, tokens: 250000},
    description: 'Derive total output amount for chain tokens.',
    expected: {fee: 1342},
  },
  {
    args: {},
    description: 'Base fee is required',
    error: 'ExpectedBaseFeeAmountToCalculateSwapInInvoiceTokens',
  },
  {
    args: {base_fee: 1337},
    description: 'Fee rate is required',
    error: 'ExpectedFeeRateToCalculateSwapInInvoiceTokens',
  },
  {
    args: {base_fee: 1337, fee_rate: 21},
    description: 'Tokens are required',
    error: 'ExpectedTokensToCalculateSwapInInvoiceTokens',
  },
  {
    args: {base_fee: 1337, fee_rate: 1000001, tokens: 250000},
    description: 'Fee rate must be below divisor.',
    error: 'ExpectedFeeRateInPartsPerMillionForTokensCalculation',
  },
];

tests.forEach(({args, description, error, expected}) => {
  return test(description, (t, end) => {
    if (!!error) {
      throws(() => swapInFee(args), new Error(error));
    } else {
      const {fee} = swapInFee(args);

      equal(fee, expected.fee, 'Swap fee derived');
    }

    return end();
  });
});

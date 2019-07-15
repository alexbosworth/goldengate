const {test} = require('tap');

const {checkQuote} = require('./../../');

const tests = [
  {
    args: {
      base_fee: 1,
      cltv_delta: 100,
      deposit: 10,
      fee_rate: 10000,
      max_deposit: 11,
      max_fee: 101,
      max_tokens: 100000,
      min_cltv_delta: 5,
      min_tokens: 1000,
      tokens: 10000,
    },
    description: 'A quote is within acceptable parameters',
  },
  {
    args: {
      base_fee: 1,
      cltv_delta: 100,
      deposit: 10,
      fee_rate: 10000,
      max_deposit: 11,
      max_fee: 101,
      max_tokens: 100000,
      min_cltv_delta: 5,
      min_tokens: 100000,
      tokens: 10000,
    },
    description: 'Tokens must be over the minimum',
    error: 'TooFewTokensToInitiateSwap',
  },
  {
    args: {
      base_fee: 1,
      cltv_delta: 100,
      deposit: 10,
      fee_rate: 10000,
      max_deposit: 11,
      max_fee: 101,
      max_tokens: 1e5,
      min_cltv_delta: 5,
      min_tokens: 1e3,
      tokens: 1e6,
    },
    description: 'Tokens must be under the maximum',
    error: 'TooManyTokensToInitiateSwap',
  },
  {
    args: {
      base_fee: 1,
      cltv_delta: 100,
      deposit: 10,
      fee_rate: 20000,
      max_deposit: 11,
      max_fee: 101,
      max_tokens: 1e5,
      min_cltv_delta: 5,
      min_tokens: 1e3,
      tokens: 1e4,
    },
    description: 'Fee rate must be below maximum',
    error: 'FeesExceedMaxAcceptableFee',
  },
  {
    args: {
      base_fee: 1,
      cltv_delta: 100,
      deposit: 10,
      fee_rate: 10000,
      max_deposit: 9,
      max_fee: 101,
      max_tokens: 1e5,
      min_cltv_delta: 5,
      min_tokens: 1e3,
      tokens: 1e4,
    },
    description: 'Tokens must be under the maximum',
    error: 'DepositExceedsMaxFeeRate',
  },
  {
    args: {
      base_fee: 1,
      cltv_delta: 4,
      deposit: 10,
      fee_rate: 10000,
      max_deposit: 11,
      max_fee: 101,
      max_tokens: 1e5,
      min_cltv_delta: 5,
      min_tokens: 1e3,
      tokens: 1e4,
    },
    description: 'Cltv must be sufficient',
    error: 'ExpectedMoreTimeToCompleteSwap',
  },
];

tests.forEach(({args, description, error}) => {
  return test(description, ({end, throws}) => {
    if (!!error) {
      throws(() => checkQuote(args), new Error(error));
    } else {
      checkQuote(args);
    }

    return end();
  });
});

const {equal} = require('node:assert').strict;
const test = require('node:test');
const {throws} = require('node:assert').strict;

const {checkSwapTiming} = require('./../../');

const tests = [
  {
    args: {
      current_block_height: 100,
      required_buffer_blocks: 8,
      required_funding_confirmations: 6,
      required_sweep_confirmations: 6,
      timeout_height: 120,
    },
    description: 'Return buffer block count',
    expected: 8,
  },
  {
    args: {
      current_block_height: 100,
      required_funding_confirmations: 6,
      required_sweep_confirmations: 6,
      timeout_height: 120,
    },
    description: 'Return general buffer block count',
    expected: 8,
  },
  {
    args: {
      current_block_height: 100,
      required_buffer_blocks: 9,
      required_funding_confirmations: 6,
      required_sweep_confirmations: 6,
      timeout_height: 120,
    },
    description: 'Throws error, insufficient blocks',
    error: 'InsufficientTimeRemainingForSwap',
  },
  {
    args: {},
    description: 'Throws error, no current height',
    error: 'ExpectedCurrentBlockHeight',
  },
  {
    args: {current_block_height: 100},
    description: 'Throws error, required funding confs',
    error: 'ExpectedRequiredFundingConfirmationsCount',
  },
  {
    args: {current_block_height: 1, required_funding_confirmations: 6},
    description: 'Throws error, required sweep confs count',
    error: 'ExpectedRequiredSweepConfirmationsCount',
  },
  {
    args: {
      current_block_height: 100,
      required_funding_confirmations: 6,
      required_sweep_confirmations: 6,
    },
    description: 'Throws error, requires timeout height',
    error: 'ExpectedSwapTimeoutHeight',
  },
];

tests.forEach(({args, description, error, expected}) => {
  return test(description, (t, end) => {
    if (!!error) {
      throws(() => checkSwapTiming(args), new Error(error));
    } else {
      const res = checkSwapTiming(args);

      equal(res.buffer_count, expected, 'Got buffer blocks count');
    }

    return end();
  });
});

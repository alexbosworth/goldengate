const {deepEqual} = require('node:assert').strict;
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
    expected: {buffer_count: 8},
  },
  {
    args: {
      current_block_height: 100,
      required_funding_confirmations: 6,
      required_sweep_confirmations: 6,
      timeout_height: 120,
    },
    description: 'Return general buffer block count',
    expected: {buffer_count: 8},
  },
  {
    args: {
      current_block_height: 100,
      required_funding_confirmations: 6,
      required_sweep_confirmations: 6,
      timeout_height: 112,
    },
    description: 'No buffer is needed without a required buffer',
    expected: {buffer_count: 0},
  },
  {
    args: {
      current_block_height: 100,
      required_funding_confirmations: 6,
      required_sweep_confirmations: 6,
      timeout_height: 111,
    },
    description: 'Confirmations are needed without a required buffer',
    error: 'InsufficientTimeRemainingForSwap',
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
  return test(description, () => {
    if (!!error) {
      throws(() => checkSwapTiming(args), new Error(error), 'Got error');
    } else {
      deepEqual(checkSwapTiming(args), expected, 'Got buffer blocks count');
    }

    return;
  });
});

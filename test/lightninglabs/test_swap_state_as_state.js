const {deepEqual} = require('node:assert').strict;
const test = require('node:test');
const {throws} = require('node:assert').strict;

const swapStateAsState = require('./../../lightninglabs/swap_state_as_state');

const tests = [
  {
    args: {state: 'state', timestamp_ns: '0'},
    description: 'Unrecognized state returns date',
    expected: {at: '1970-01-01T00:00:00.000Z'},
  },
  {
    args: {state: 'SERVER_FAILED_INVALID_HTLC_AMOUNT', timestamp_ns: '0'},
    description: 'Invalid HTLC amount returns state details',
    expected: {
      at: '1970-01-01T00:00:00.000Z',
      is_broadcast: true,
      is_claimed: false,
      is_confirmed: true,
      is_failed: true,
      is_known: true,
    },
  },
  {
    args: {state: 'SERVER_FAILED_NO_HTLC', timestamp_ns: '0'},
    description: 'Late or missing HTLC returns state details',
    expected: {
      at: '1970-01-01T00:00:00.000Z',
      is_claimed: false,
      is_failed: true,
      is_known: true,
    },
  },
  {
    args: {state: 'SERVER_FAILED_OFF_CHAIN_TIMEOUT', timestamp_ns: '0'},
    description: 'Off chain timeout returns state details',
    expected: {
      at: '1970-01-01T00:00:00.000Z',
      is_broadcast: true,
      is_claimed: false,
      is_confirmed: true,
      is_failed: true,
      is_known: true,
    },
  },
  {
    args: {state: 'SERVER_FAILED_HTLC_PUBLICATION', timestamp_ns: '0'},
    description: 'On chain HTLC failed to publish',
    expected: {
      at: '1970-01-01T00:00:00.000Z',
      is_broadcast: false,
      is_claimed: false,
      is_confirmed: false,
      is_failed: true,
      is_known: true,
      is_refunded: false,
    },
  },
  {
    args: {state: 'SERVER_FAILED_SWAP_DEADLINE', timestamp_ns: '0'},
    description: 'On chain HTLC failed to publish in time',
    expected: {
      at: '1970-01-01T00:00:00.000Z',
      is_broadcast: false,
      is_claimed: false,
      is_confirmed: false,
      is_failed: true,
      is_known: true,
      is_refunded: false,
    },
  },
  {
    args: {state: 'SERVER_FAILED_TIMEOUT', timestamp_ns: '0'},
    description: 'On chain HTLC was claimed with timeout path',
    expected: {
      at: '1970-01-01T00:00:00.000Z',
      is_broadcast: true,
      is_claimed: false,
      is_confirmed: true,
      is_failed: true,
      is_known: true,
      is_refunded: true,
    },
  },
  {
    args: {state: 'SERVER_TIMEOUT_PUBLISHED', timestamp_ns: '0'},
    description: 'On chain HTLC was claimed with timeout path',
    expected: {
      at: '1970-01-01T00:00:00.000Z',
      is_broadcast: true,
      is_claimed: false,
      is_known: true,
      is_refunded: false,
    },
  },
  {
    args: {state: 'SERVER_UNEXPECTED_FAILURE', timestamp_ns: '0'},
    description: 'Swap had an unexpected failure',
    expected: {
      at: '1970-01-01T00:00:00.000Z',
      is_failed: true,
      is_known: true,
    },
  },
  {
    args: {state: 'SERVER_FAILED_UNKNOWN', timestamp_ns: '0'},
    description: 'Swap had an unknown failure',
    expected: {
      at: '1970-01-01T00:00:00.000Z',
      is_failed: true,
      is_known: true,
    },
  },
  {
    args: {state: 'SERVER_HTLC_PUBLISHED', timestamp_ns: '0'},
    description: 'On chain HTLC was sent to the mempool',
    expected: {
      at: '1970-01-01T00:00:00.000Z',
      is_broadcast: true,
      is_claimed: false,
      is_confirmed: false,
      is_failed: false,
      is_known: true,
      is_refunded: false,
    },
  },
  {
    args: {state: 'SERVER_SUCCESS', timestamp_ns: '0'},
    description: 'On chain HTLC was swept with preimage',
    expected: {
      at: '1970-01-01T00:00:00.000Z',
      is_broadcast: true,
      is_claimed: true,
      is_confirmed: true,
      is_failed: false,
      is_known: true,
      is_refunded: false,
    },
  },
  {
    args: {state: 'SERVER_HTLC_CONFIRMED', timestamp_ns: '0'},
    description: 'On chain HTLC confirmed on chain',
    expected: {
      at: '1970-01-01T00:00:00.000Z',
      is_broadcast: true,
      is_claimed: false,
      is_confirmed: true,
      is_failed: false,
      is_known: true,
      is_refunded: false,
    },
  },
  {
    args: {state: 'SERVER_INITIATED', timestamp_ns: '0'},
    description: 'Swap has been started',
    expected: {
      at: '1970-01-01T00:00:00.000Z',
      is_broadcast: false,
      is_claimed: false,
      is_confirmed: false,
      is_failed: false,
      is_known: true,
      is_refunded: false,
    },
  },
  {
    args: {},
    description: 'State is required',
    error: 'ExpectedSwapStateToDeriveSwapStateDetails',
  },
  {
    args: {state: 'state'},
    description: 'Timestamp is required',
    error: 'ExpectedSwapUpdateTimestampToDeriveSwapStateDetails',
  },
];

tests.forEach(({args, description, error, expected}) => {
  return test(description, (t, end) => {
    if (!!error) {
      throws(() => swapStateAsState(args), new Error(error), 'Got error');
    } else {
      const state = swapStateAsState(args);

      deepEqual(state, expected, 'Swap state derived');
    }

    return end();
  });
});

const {deepEqual} = require('node:assert').strict;
const test = require('node:test');

const method = require('./../../lightninglabs/check_swap_in_fallback');

const nonce = Buffer.alloc(66, 2);

const makeArgs = overrides => {
  const args = {
    utxos_count: 1,
    has_change: true,
    is_backup: false,
    signing: {fee_rate: '2500', nonces: [nonce]},
    tokens: 251000,
    type: 'standard',
  };

  Object.keys(overrides || {}).forEach(k => args[k] = overrides[k]);

  return args;
};

const tests = [
  {
    args: makeArgs({}),
    description: 'HTLC signing info is checked',
    expected: {
      fallback: {
        fee: 1540,
        fee_tokens_per_kw: 2500,
        nonces: [nonce.toString('hex')],
        type: 'standard',
      },
    },
  },
  {
    args: makeArgs({signing: undefined}),
    description: 'Signing info is expected',
    expected: {error: [503, 'ExpectedFallbackSigningInfoForSwapIn']},
  },
  {
    args: makeArgs({signing: {fee_rate: '2500'}}),
    description: 'Signing nonces are expected',
    expected: {error: [503, 'ExpectedFallbackSigningInfoForSwapIn']},
  },
  {
    args: makeArgs({utxos_count: 2}),
    description: 'A nonce is expected for every utxo',
    expected: {error: [503, 'ExpectedNonceForEverySwapInUtxo']},
  },
  {
    args: makeArgs({signing: {fee_rate: '2500', nonces: [Buffer.alloc(1)]}}),
    description: 'Valid nonces are expected',
    expected: {error: [503, 'ExpectedValidNoncesForSwapIn']},
  },
  {
    args: makeArgs({signing: {fee_rate: 'rate', nonces: [nonce]}}),
    description: 'A numeric fee rate is expected',
    expected: {error: [503, 'ExpectedFallbackFeeRateForSwapIn']},
  },
  {
    args: makeArgs({signing: {fee_rate: '-1', nonces: [nonce]}}),
    description: 'A positive fee rate is expected',
    expected: {error: [503, 'ExpectedFallbackFeeRateForSwapIn']},
  },
  {
    args: makeArgs({tokens: 7700}),
    description: 'A standard HTLC fee can be up to the most allowed',
    expected: {
      fallback: {
        fee: 1540,
        fee_tokens_per_kw: 2500,
        nonces: [nonce.toString('hex')],
        type: 'standard',
      },
    },
  },
  {
    args: makeArgs({tokens: 7699}),
    description: 'A standard HTLC fee over the most allowed is rejected',
    expected: {
      error: [503, 'ExpectedLowerFallbackFeeForSwapIn', {type: 'standard'}],
    },
  },
  {
    args: makeArgs({tokens: 7000}),
    description: 'A lower fee is expected for a standard HTLC',
    expected: {
      error: [503, 'ExpectedLowerFallbackFeeForSwapIn', {type: 'standard'}],
    },
  },
  {
    args: makeArgs({is_backup: true, tokens: 7000, type: 'high'}),
    description: 'A backup HTLC allows a higher fee',
    expected: {
      fallback: {
        fee: 1540,
        fee_tokens_per_kw: 2500,
        nonces: [nonce.toString('hex')],
        type: 'high',
      },
    },
  },
  {
    args: makeArgs({has_change: false, is_backup: true, tokens: 2219}),
    description: 'A backup HTLC fee is limited',
    expected: {
      error: [503, 'ExpectedLowerFallbackFeeForSwapIn', {type: 'standard'}],
    },
  },
];

tests.forEach(({args, description, expected}) => {
  return test(description, (t, end) => {
    deepEqual(method(args), expected, 'Got expected result');

    return end();
  });
});

const {deepEqual} = require('node:assert').strict;
const test = require('node:test');
const {throws} = require('node:assert').strict;

const method = require('./../../taproot/swap_in_fallback_fee');

const tests = [
  {
    args: {utxos_count: 1, fee_tokens_per_kw: 253},
    description: 'Fee for a single utxo HTLC transaction',
    expected: {fee: 112, weight: 444},
  },
  {
    args: {utxos_count: 1, fee_tokens_per_kw: 2500, has_change: true},
    description: 'Fee for a single utxo HTLC transaction with change',
    expected: {fee: 1540, weight: 616},
  },
  {
    args: {utxos_count: 2, fee_tokens_per_kw: 12345, has_change: true},
    description: 'Fee for a two utxo HTLC transaction with change',
    expected: {fee: 10443, weight: 846},
  },
  {
    args: {utxos_count: 3, fee_tokens_per_kw: 1000, has_change: true},
    description: 'Fee for a three utxo HTLC transaction with change',
    expected: {fee: 1076, weight: 1076},
  },
  {
    args: {utxos_count: 252, fee_tokens_per_kw: 253},
    description: 'Fee for the most utxos in a single byte inputs count',
    expected: {fee: 14718, weight: 58174},
  },
  {
    args: {utxos_count: 253, fee_tokens_per_kw: 253},
    description: 'Fee for utxos needing a three byte inputs count',
    expected: {fee: 14778, weight: 58412},
  },
  {
    args: {utxos_count: 1, fee_tokens_per_kw: 1},
    description: 'Fee is rounded down',
    expected: {fee: 0, weight: 444},
  },
  {
    args: {fee_tokens_per_kw: 253},
    description: 'A utxos count is expected',
    error: 'ExpectedUtxosCountToGetServiceFallbackFee',
  },
  {
    args: {utxos_count: 0, fee_tokens_per_kw: 253},
    description: 'A positive utxos count is expected',
    error: 'ExpectedUtxosCountToGetServiceFallbackFee',
  },
  {
    args: {utxos_count: 1.5, fee_tokens_per_kw: 253},
    description: 'A whole number utxos count is expected',
    error: 'ExpectedUtxosCountToGetServiceFallbackFee',
  },
  {
    args: {utxos_count: 1},
    description: 'A fee rate is expected',
    error: 'ExpectedFeeRateToGetServiceFallbackFee',
  },
  {
    args: {utxos_count: 1, fee_tokens_per_kw: '253'},
    description: 'A number fee rate is expected',
    error: 'ExpectedFeeRateToGetServiceFallbackFee',
  },
  {
    args: {utxos_count: 1, fee_tokens_per_kw: -1},
    description: 'A non negative fee rate is expected',
    error: 'ExpectedFeeRateToGetServiceFallbackFee',
  },
];

tests.forEach(({args, description, error, expected}) => {
  return test(description, (t, end) => {
    if (!!error) {
      throws(() => method(args), new Error(error), 'Got expected error');
    } else {
      deepEqual(method(args), expected, 'Got expected fee and weight');
    }

    return end();
  });
});

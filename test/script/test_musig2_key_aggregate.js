const {deepEqual} = require('node:assert').strict;
const test = require('node:test');
const {throws} = require('node:assert').strict;

const method = require('./../../script/musig2_key_aggregate');

// BIP 327 key_agg_vectors.json, with the key parity of the BIP 327 KeyAgg
const pubkeys = [
  '02F9308A019258C31049344F85F89D5229B531C845836F99B08601F113BCE036F9',
  '03DFF1D77F2A671C5F36183726DB2341BE58FEAE1DA2DECED843240F7B502BA659',
  '023590A94E768F8E1815C2F24B4D80A8E3149316C3518CE7B7AD338368D038CA66',
  '020000000000000000000000000000000000000000000000000000000000000005',
  '02FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEFFFFFC30',
  '04F9308A019258C31049344F85F89D5229B531C845836F99B08601F113BCE036F9',
  '03935F972DA013F80AE011890FA89B67A27B7BE6CCB24D3274D18B2D4067F261A9',
];

const tests = [
  {
    args: {public_keys: [0, 1, 2].map(i => pubkeys[i])},
    description: 'BIP 327 KeyAgg vector: keys in given order',
    expected: {
      public_key: '0290539eede565f5d054f32cc0c220126889ed1e5d193baf15aef344fe59d4610c',
    },
  },
  {
    args: {public_keys: [2, 1, 0].map(i => pubkeys[i])},
    description: 'BIP 327 KeyAgg vector: keys in reverse order',
    expected: {
      public_key: '036204de8b083426dc6eaf9502d27024d53fc826bf7d2012148a0575435df54b2b',
    },
  },
  {
    args: {public_keys: [0, 0, 0].map(i => pubkeys[i])},
    description: 'BIP 327 KeyAgg vector: the same key repeated',
    expected: {
      public_key: '02b436e3bad62b8cd409969a224731c193d051162d8c5ae8b109306127da3aa935',
    },
  },
  {
    args: {public_keys: [0, 0, 1, 1].map(i => pubkeys[i])},
    description: 'BIP 327 KeyAgg vector: second key is repeated',
    expected: {
      public_key: '0369bc22bfa5d106306e48a20679de1d7389386124d07571d0d872686028c26a3e',
    },
  },
  {
    args: {public_keys: [0, 3].map(i => pubkeys[i])},
    description: 'BIP 327 KeyAgg vector: invalid public key',
    error: 'ExpectedValidCompressedPublicKeysToAggregateForMuSig2',
  },
  {
    args: {public_keys: [0, 4].map(i => pubkeys[i])},
    description: 'BIP 327 KeyAgg vector: public key exceeds field size',
    error: 'ExpectedValidCompressedPublicKeysToAggregateForMuSig2',
  },
  {
    args: {public_keys: [5, 0].map(i => pubkeys[i])},
    description: 'BIP 327 KeyAgg vector: first byte is not 2 or 3',
    error: 'ExpectedValidCompressedPublicKeysToAggregateForMuSig2',
  },
  {
    args: {
      public_keys: [
        '024d4b6cd1361032ca9bd2aeb9d900aa4d45d9ead80ac9423374c451a7254d0766',
        '031b84c5567b126440995d3ed5aaba0565d71e1834604819ff9c17f5e9d5dd078f',
      ],
    },
    description: 'Aggregate key keeps its parity in compressed form',
    expected: {
      public_key: '0399a9da2f1aa3e4403438bfea7c2bc1ea9956469297f4f931c2531c24c38d5994',
    },
  },
  {
    args: {},
    description: 'An array of public keys is expected',
    error: 'ExpectedArrayOfPublicKeysToAggregateForMuSig2',
  },
  {
    args: {public_keys: []},
    description: 'Public keys are expected',
    error: 'ExpectedArrayOfPublicKeysToAggregateForMuSig2',
  },
  {
    args: {public_keys: [pubkeys[0].slice(2)]},
    description: 'Compressed public keys are expected',
    error: 'ExpectedValidCompressedPublicKeysToAggregateForMuSig2',
  },
];

tests.forEach(({args, description, error, expected}) => {
  return test(description, (t, end) => {
    if (!!error) {
      throws(() => method(args), new Error(error), 'Got expected error');
    } else {
      deepEqual(method(args), expected, 'Got expected aggregate key');
    }

    return end();
  });
});

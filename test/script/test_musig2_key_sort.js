const {deepEqual} = require('node:assert').strict;
const test = require('node:test');
const {throws} = require('node:assert').strict;

const method = require('./../../script/musig2_key_sort');

// BIP 327 key_sort_vectors.json
const vectors = {
  pubkeys: [
    '02DD308AFEC5777E13121FA72B9CC1B7CC0139715309B086C960E18FD969774EB8',
    '02F9308A019258C31049344F85F89D5229B531C845836F99B08601F113BCE036F9',
    '03DFF1D77F2A671C5F36183726DB2341BE58FEAE1DA2DECED843240F7B502BA659',
    '023590A94E768F8E1815C2F24B4D80A8E3149316C3518CE7B7AD338368D038CA66',
    '02DD308AFEC5777E13121FA72B9CC1B7CC0139715309B086C960E18FD969774EB8',
  ],
  sorted_pubkeys: [
    '023590A94E768F8E1815C2F24B4D80A8E3149316C3518CE7B7AD338368D038CA66',
    '02DD308AFEC5777E13121FA72B9CC1B7CC0139715309B086C960E18FD969774EB8',
    '02DD308AFEC5777E13121FA72B9CC1B7CC0139715309B086C960E18FD969774EB8',
    '02F9308A019258C31049344F85F89D5229B531C845836F99B08601F113BCE036F9',
    '03DFF1D77F2A671C5F36183726DB2341BE58FEAE1DA2DECED843240F7B502BA659',
  ],
};

const tests = [
  {
    args: {public_keys: vectors.pubkeys},
    description: 'Keys are sorted in BIP 327 KeySort order',
    expected: {sorted: vectors.sorted_pubkeys.map(key => key.toLowerCase())},
  },
  {
    args: {public_keys: []},
    description: 'No keys sorts to no keys',
    expected: {sorted: []},
  },
  {
    args: {},
    description: 'An array of keys is expected',
    error: 'ExpectedArrayOfPublicKeysToSortForMuSig2',
  },
  {
    args: {public_keys: [vectors.pubkeys[0].slice(2)]},
    description: 'Compressed keys are expected',
    error: 'ExpectedCompressedPublicKeysToSortForMuSig2',
  },
  {
    args: {public_keys: [`${vectors.pubkeys[0].slice(2)}zz`]},
    description: 'Hex keys are expected',
    error: 'ExpectedCompressedPublicKeysToSortForMuSig2',
  },
];

tests.forEach(({args, description, error, expected}) => {
  return test(description, (t, end) => {
    if (!!error) {
      throws(() => method(args), new Error(error), 'Got expected error');
    } else {
      deepEqual(method(args), expected, 'Got expected sorted keys');
    }

    return end();
  });
});

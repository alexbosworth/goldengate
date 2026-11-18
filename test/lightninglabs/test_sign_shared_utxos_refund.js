const {deepEqual} = require('node:assert').strict;
const {rejects} = require('node:assert').strict;
const test = require('node:test');

const {makeLnd} = require('mock-lnd');
const {makeRpcError} = require('mock-lnd');
const {pointFromScalar} = require('tiny-secp256k1');

const {signSharedUtxosRefund} = require('./../../');

const bufferAsHex = buffer => Buffer.from(buffer).toString('hex');
const clientSecret = Buffer.alloc(32, 1).toString('hex');
const sweepAddress = 'bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4';

const utxos = [
  {
    tokens: 200000,
    transaction_id: '4bf5122f344554c53bde2ebb8cd2b7e3d1600ad631c385a5d7cce23c7785459a',
    transaction_vout: 1,
  },
  {
    tokens: 100000,
    transaction_id: 'dbc1b4c900ffe48d575b5da5c638040125f65db0fe3e24494b76ea986457d986',
    transaction_vout: 3,
  },
];

// The refund transaction was checked with an independent implementation
const refund = {
  id: '338db30954c74bc56d7067284c1b377a65ba6dc44b81afb3b09063f27dd07f7a',
  transaction: '020000000001029a4585773ce2ccd7a585c331d60a60d1e3b7d28cbb2ede3bc55445342f12f54b01000000004038000086d9576498ea764b49243efeb05df625010438c6a55d5b578de4ff00c9b4c1db030000000040380000015e92040000000000160014751e76e8199196d454941c45d1b3a323f1433bd60340885c38f5d710d20966eda4d6acc0696ad67b32c0af03659af66a1176a3e3ad8acbc579aed8761165bbd3b9d53cf5b3213d6f648c7d2064af7883992f98905db126201b84c5567b126440995d3ed5aaba0565d71e1834604819ff9c17f5e9d5dd078fad024038b221c099a9da2f1aa3e4403438bfea7c2bc1ea9956469297f4f931c2531c24c38d59940340f99c4bab621552318e9ea7ca9eedc2b06e0787a4cc9201fd973bcb12258acd7946640044470ba474694f45a61555dc607dac141fa276c9a734a8b23be5cd6eea26201b84c5567b126440995d3ed5aaba0565d71e1834604819ff9c17f5e9d5dd078fad024038b221c099a9da2f1aa3e4403438bfea7c2bc1ea9956469297f4f931c2531c24c38d599400000000',
};

// The refund at 1.5 sat/vB is 193 vbytes, so the fee 289.5 rounds up to 290
const refundRoundedFee = {
  id: 'c7c0b68b9fdbf7bb17f69f0adb370215c54c5a0383417dca2e6a912b72804b7f',
  transaction: '020000000001029a4585773ce2ccd7a585c331d60a60d1e3b7d28cbb2ede3bc55445342f12f54b01000000004038000086d9576498ea764b49243efeb05df625010438c6a55d5b578de4ff00c9b4c1db03000000004038000001be92040000000000160014751e76e8199196d454941c45d1b3a323f1433bd6034055ad81e97b6a67df41e75e8908c29be75b6454668789095f84be8f50a201784dd50148688b5e71dc12baedc19f81468977389ca4dbcb4ef267637adeeca901b826201b84c5567b126440995d3ed5aaba0565d71e1834604819ff9c17f5e9d5dd078fad024038b221c099a9da2f1aa3e4403438bfea7c2bc1ea9956469297f4f931c2531c24c38d59940340e29d119cb5f07fcdb0c47db71af7c4e2156b3fe6e13654910f69168d5db91d849e01561ff1dee8a2130ebfbc5699addee18307debff0c2b3d15e31572f5f921426201b84c5567b126440995d3ed5aaba0565d71e1834604819ff9c17f5e9d5dd078fad024038b221c099a9da2f1aa3e4403438bfea7c2bc1ea9956469297f4f931c2531c24c38d599400000000',
};

// A refund held back until after block 800000 by its locktime, also checked
const refundLater = {
  id: '94f842538acb522c57e594f791cbf2d6de4530005b7cb159ed8f9ee7b12731e2',
  transaction: '020000000001029a4585773ce2ccd7a585c331d60a60d1e3b7d28cbb2ede3bc55445342f12f54b01000000004038000086d9576498ea764b49243efeb05df625010438c6a55d5b578de4ff00c9b4c1db030000000040380000015e92040000000000160014751e76e8199196d454941c45d1b3a323f1433bd603408cb164b7d33cd800ae9358638a726cbc0ed31522ed3f33739d5566eba0a9bc9f7d3bc7c39c0be3104dd0b5c960b917e0df69afb813dfcef0112a073f2433306b26201b84c5567b126440995d3ed5aaba0565d71e1834604819ff9c17f5e9d5dd078fad024038b221c099a9da2f1aa3e4403438bfea7c2bc1ea9956469297f4f931c2531c24c38d599403408780188a49d91981a903e12bda6fc4fad855f7435781608161b4367297ac837fad46f0af14f981dc298a61eb17324ca8710a6b872ad0c3da9489f2026aaa49b026201b84c5567b126440995d3ed5aaba0565d71e1834604819ff9c17f5e9d5dd078fad024038b221c099a9da2f1aa3e4403438bfea7c2bc1ea9956469297f4f931c2531c24c38d599400350c00',
};

// A fake LND with the client key of the shared address
const clientLnd = args => makeLnd({
  failures: args.failures,
  keys: [{family: 42060, index: 7, secret: clientSecret}],
});

// A fake LND that gives signatures that LND would not give
const signingLnd = ({signatures}) => {
  const lnd = clientLnd({});

  lnd.signer.signOutputRaw = ({}, cbk) => cbk(null, {raw_sigs: signatures});

  return lnd;
};

const makeArgs = overrides => {
  const serviceKey = bufferAsHex(pointFromScalar(Buffer.alloc(32, 2), true));

  const args = {
    utxos,
    expiry: 14400,
    fee_tokens_per_vbyte: 2,
    key_family: 42060,
    key_index: 7,
    lnd: clientLnd({}),
    network: 'btc',
    service_public_key: serviceKey,
    sweep_address: sweepAddress,
  };

  Object.keys(overrides).forEach(k => args[k] = overrides[k]);

  return args;
};

const tests = [
  {
    args: makeArgs({utxos: undefined}),
    description: 'Utxos to refund are expected',
    error: [400, 'ExpectedUtxosForSharedUtxosRefund'],
  },
  {
    args: makeArgs({utxos: []}),
    description: 'Utxos to refund are expected to be non-empty',
    error: [400, 'ExpectedUtxosForSharedUtxosRefund'],
  },
  {
    args: makeArgs({utxos: [{...utxos[0], tokens: 0}]}),
    description: 'Utxos are expected to have tokens',
    error: [400, 'ExpectedValidUtxosForSharedUtxosRefund'],
  },
  {
    args: makeArgs({utxos: [{...utxos[0], transaction_id: '00'}]}),
    description: 'Utxos are expected to have a transaction id',
    error: [400, 'ExpectedValidUtxosForSharedUtxosRefund'],
  },
  {
    args: makeArgs({utxos: [{...utxos[0], transaction_vout: -1}]}),
    description: 'Utxos are expected to have an output index',
    error: [400, 'ExpectedValidUtxosForSharedUtxosRefund'],
  },
  {
    args: makeArgs({utxos: [{...utxos[0], transaction_vout: 2 ** 32}]}),
    description: 'Utxo output indexes are expected to be 32 bits',
    error: [400, 'ExpectedValidUtxosForSharedUtxosRefund'],
  },
  {
    args: makeArgs({
      utxos: [
        {...utxos[0], tokens: 21e14},
        {...utxos[1], tokens: 1},
      ],
    }),
    description: 'Utxos cannot have more than all the tokens there are',
    error: [400, 'ExpectedValidUtxosForSharedUtxosRefund'],
  },
  {
    args: makeArgs({
      utxos: [
        utxos[0],
        {
          ...utxos[0],
          transaction_id: utxos[0].transaction_id.toUpperCase(),
        },
      ],
    }),
    description: 'A utxo can only be refunded once',
    error: [400, 'UnexpectedDuplicateSharedUtxoToRefund'],
  },
  {
    args: makeArgs({expiry: undefined}),
    description: 'A shared address expiry is expected',
    error: [400, 'ExpectedExpiryForSharedUtxosRefund'],
  },
  {
    args: makeArgs({fee_tokens_per_vbyte: 0}),
    description: 'A fee rate is expected',
    error: [400, 'ExpectedFeeRateForSharedUtxosRefund'],
  },
  {
    args: makeArgs({key_family: undefined}),
    description: 'A key family is expected',
    error: [400, 'ExpectedKeyFamilyForSharedUtxosRefund'],
  },
  {
    args: makeArgs({key_index: undefined}),
    description: 'A key index is expected',
    error: [400, 'ExpectedKeyIndexForSharedUtxosRefund'],
  },
  {
    args: makeArgs({lnd: undefined}),
    description: 'An LND object is expected',
    error: [400, 'ExpectedAuthenticatedLndForSharedUtxosRefund'],
  },
  {
    args: makeArgs({network: 'network'}),
    description: 'A known network is expected',
    error: [400, 'ExpectedKnownNetworkForSharedUtxosRefund'],
  },
  {
    args: makeArgs({service_public_key: undefined}),
    description: 'A shared address service key is expected',
    error: [400, 'ExpectedServiceKeyForSharedUtxosRefund'],
  },
  {
    args: makeArgs({sweep_address: undefined}),
    description: 'A sweep address is expected',
    error: [400, 'ExpectedSweepAddressForSharedUtxosRefund'],
  },
  {
    args: makeArgs({network: 'btctestnet'}),
    description: 'The sweep address is expected to be for the network',
    error: [400, 'ExpectedValidSweepAddressForSharedUtxosRefund'],
  },
  {
    args: makeArgs({service_public_key: Buffer.alloc(33, 3).toString('hex')}),
    description: 'A valid shared address service key is expected',
    error: [
      400,
      'FailedToDeriveSharedAddressToRefund',
      {err: new Error('ExpectedValidServerPublicKeyForSharedAddressScript')},
    ],
  },
  {
    args: makeArgs({fee_tokens_per_vbyte: 1553}),
    description: 'A refund cannot be dust',
    error: [400, 'ExpectedMoreTokensForSharedUtxosRefund', {fee: 299729}],
  },
  {
    args: makeArgs({
      lnd: clientLnd({
        failures: [{details: 'err', method: 'signOutputRaw', type: 'signer'}],
      }),
    }),
    description: 'An error signing is passed back',
    error: [
      503,
      'UnexpectedErrorWhenSigning',
      {err: makeRpcError({details: 'err'})},
    ],
  },
  {
    args: makeArgs({lnd: signingLnd({signatures: [Buffer.alloc(64, 1)]})}),
    description: 'A signature is expected for every utxo',
    error: [503, 'ExpectedSignatureForEveryUtxoToRefund'],
  },
  {
    args: makeArgs({
      lnd: signingLnd({signatures: utxos.map(() => Buffer.alloc(64, 1))}),
    }),
    description: 'Signatures are expected to spend the timeout path',
    error: [503, 'ExpectedValidSignatureForSharedUtxoRefund'],
  },
  {
    args: makeArgs({
      lnd: signingLnd({signatures: utxos.map(() => Buffer.alloc(65, 1))}),
    }),
    description: 'Signatures are expected to be default sighash signatures',
    error: [503, 'ExpectedValidSignatureForSharedUtxoRefund'],
  },
  {
    args: makeArgs({
      lnd: signingLnd({signatures: utxos.map(() => Buffer.alloc(64, 255))}),
    }),
    description: 'Signatures are expected to be well formed',
    error: [503, 'ExpectedValidSignatureForSharedUtxoRefund'],
  },
  {
    args: makeArgs({block_height: 1.5}),
    description: 'A timelock height is expected to be a whole number',
    error: [400, 'ExpectedTimelockHeightForSharedUtxosRefund'],
  },
  {
    args: makeArgs({block_height: -1}),
    description: 'A timelock height is expected to not be negative',
    error: [400, 'ExpectedTimelockHeightForSharedUtxosRefund'],
  },
  {
    args: makeArgs({block_height: 500000000}),
    description: 'A timelock is expected to be a block height',
    error: [400, 'ExpectedTimelockHeightForSharedUtxosRefund'],
  },
  {
    args: makeArgs({}),
    description: 'Refund expired shared address utxos',
    expected: refund,
  },
  {
    args: makeArgs({block_height: 800000}),
    description: 'A refund can be held back until a later block',
    expected: refundLater,
  },
  {
    args: makeArgs({fee_tokens_per_vbyte: 1.5}),
    description: 'A fractional fee rate is rounded up to the whole fee',
    expected: refundRoundedFee,
  },
];

tests.forEach(({args, description, error, expected}) => {
  return test(description, async () => {
    if (!!error) {
      await rejects(signSharedUtxosRefund(args), error, 'Got error');
    } else {
      deepEqual(await signSharedUtxosRefund(args), expected, 'Got refund');
    }

    return;
  });
});

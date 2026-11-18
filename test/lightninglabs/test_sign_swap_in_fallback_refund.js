const {deepEqual} = require('node:assert').strict;
const {rejects} = require('node:assert').strict;
const test = require('node:test');

const {makeLnd} = require('mock-lnd');
const {makeRpcError} = require('mock-lnd');
const {pointFromScalar} = require('tiny-secp256k1');

const {signSwapInFallbackRefund} = require('./../../');

const bufferAsHex = buffer => Buffer.from(buffer).toString('hex');
const clientSecret = Buffer.alloc(32, 1).toString('hex');
const swapHash = Buffer.alloc(32, 3).toString('hex');
const sweepAddress = 'bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4';

const utxos = [
  {
    tokens: 250000,
    transaction_id: '4bf5122f344554c53bde2ebb8cd2b7e3d1600ad631c385a5d7cce23c7785459a',
    transaction_vout: 0,
  },
  {
    tokens: 100000,
    transaction_id: 'dbc1b4c900ffe48d575b5da5c638040125f65db0fe3e24494b76ea986457d986',
    transaction_vout: 3,
  },
];

// The refund transactions were checked with an independent implementation
const refund = {
  id: '44e26f4357748631c6bdcfbb448583e0434e7472fac6d56b73d824a58d4e2080',
  transaction: '020000000001019a4585773ce2ccd7a585c331d60a60d1e3b7d28cbb2ede3bc55445342f12f54b0000000000000000000182cf030000000000160014751e76e8199196d454941c45d1b3a323f1433bd604483045022100fecd93c3e4591a1ef7f447c6db69d89dc5ec039c4c46b209e23812fdeb2d60c6022025d6c725c26f9889b34120513214b25097bc42930b3828fa75c41e10f087b03b0121031b84c5567b126440995d3ed5aaba0565d71e1834604819ff9c17f5e9d5dd078f006121024d4b6cd1361032ca9bd2aeb9d900aa4d45d9ead80ac9423374c451a7254d0766ac6476a91479b000887626b294a914501a4cd226b58b23598388ad0300350cb16782012088a9147dd7f871ad14950c1933f65611df24e9ae02433f8851b26800350c00',
};

// The refund at 1.5 sat/vB is 135 vbytes, so the fee 202.5 rounds up to 203
const refundRoundedFee = {
  id: 'd456f4e2044917cc9f75e0b924b96bf55e8ce98595bf5b05452e5caeb859a006',
  transaction: '020000000001019a4585773ce2ccd7a585c331d60a60d1e3b7d28cbb2ede3bc55445342f12f54b00000000000000000001c5cf030000000000160014751e76e8199196d454941c45d1b3a323f1433bd604483045022100c5f28895bc70772eb808c73c9a87db608259c615628b2c1c65505396abeae4c30220680b95fd8e52d2e8f48e2f18e51547eacfd9f80348903018b7586835b1ac46860121031b84c5567b126440995d3ed5aaba0565d71e1834604819ff9c17f5e9d5dd078f006121024d4b6cd1361032ca9bd2aeb9d900aa4d45d9ead80ac9423374c451a7254d0766ac6476a91479b000887626b294a914501a4cd226b58b23598388ad0300350cb16782012088a9147dd7f871ad14950c1933f65611df24e9ae02433f8851b26800350c00',
};

const refundBoth = {
  id: '4fe898f4e36899f8f518c01dd0aecb552dd4a33609890e909abf75980b8918e1',
  transaction: '020000000001029a4585773ce2ccd7a585c331d60a60d1e3b7d28cbb2ede3bc55445342f12f54b00000000000000000086d9576498ea764b49243efeb05df625010438c6a55d5b578de4ff00c9b4c1db030000000000000000016855050000000000160014751e76e8199196d454941c45d1b3a323f1433bd604483045022100f9a4dc77ed36dd3bd15576edc54c5a0758f36b56363a2b47675d57da899271e802205773e9de41742265137288a99717f9a799b26104dfe72689bc61a5d6fd08958a0121031b84c5567b126440995d3ed5aaba0565d71e1834604819ff9c17f5e9d5dd078f006121024d4b6cd1361032ca9bd2aeb9d900aa4d45d9ead80ac9423374c451a7254d0766ac6476a91479b000887626b294a914501a4cd226b58b23598388ad0300350cb16782012088a9147dd7f871ad14950c1933f65611df24e9ae02433f8851b268044730440220194b26d3407b73c32602ea0ed020999411c7e60c525712bdd858243f5423d27302207b602e064613f9ed73a6d00b2083fc0964208c1dc96a13e304da8726da0ed0710121031b84c5567b126440995d3ed5aaba0565d71e1834604819ff9c17f5e9d5dd078f006121024d4b6cd1361032ca9bd2aeb9d900aa4d45d9ead80ac9423374c451a7254d0766ac6476a91479b000887626b294a914501a4cd226b58b23598388ad0300350cb16782012088a9147dd7f871ad14950c1933f65611df24e9ae02433f8851b26800350c00',
};

// A refund held back until after block 800144 by its locktime, also checked
const refundLater = {
  id: '2b71067b3e07a81ab40e4ce1b1d988fa45eae470246148ac4e2af9f9060c8eb7',
  transaction: '020000000001019a4585773ce2ccd7a585c331d60a60d1e3b7d28cbb2ede3bc55445342f12f54b0000000000000000000182cf030000000000160014751e76e8199196d454941c45d1b3a323f1433bd604483045022100cf87ec61819235aa08faa96d796f0de1b0fffc4ecffc3e94f894903eb2e0a6b4022031093d5e4a6257ed68713fdea3eb53e494b7eb0d286acabe13bf00c3465ac7230121031b84c5567b126440995d3ed5aaba0565d71e1834604819ff9c17f5e9d5dd078f006121024d4b6cd1361032ca9bd2aeb9d900aa4d45d9ead80ac9423374c451a7254d0766ac6476a91479b000887626b294a914501a4cd226b58b23598388ad0300350cb16782012088a9147dd7f871ad14950c1933f65611df24e9ae02433f8851b26890350c00',
};

// A fake LND with the client key of the swap
const clientLnd = args => makeLnd({
  failures: args.failures,
  keys: [{family: 42060, index: 9, secret: clientSecret}],
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
    fee_tokens_per_vbyte: 2,
    hash: swapHash,
    key_family: 42060,
    key_index: 9,
    lnd: clientLnd({}),
    network: 'btc',
    service_public_key: serviceKey,
    sweep_address: sweepAddress,
    timeout: 800000,
    utxos: [utxos[0]],
  };

  Object.keys(overrides).forEach(k => args[k] = overrides[k]);

  return args;
};

const tests = [
  {
    args: makeArgs({utxos: undefined}),
    description: 'Utxos to refund are expected',
    error: [400, 'ExpectedUtxosForSwapInFallbackRefund'],
  },
  {
    args: makeArgs({utxos: []}),
    description: 'Utxos to refund are expected to be non-empty',
    error: [400, 'ExpectedUtxosForSwapInFallbackRefund'],
  },
  {
    args: makeArgs({utxos: [{...utxos[0], tokens: 0}]}),
    description: 'Utxos are expected to have tokens',
    error: [400, 'ExpectedValidUtxosForSwapInFallbackRefund'],
  },
  {
    args: makeArgs({utxos: [{...utxos[0], transaction_id: '00'}]}),
    description: 'Utxos are expected to have a transaction id',
    error: [400, 'ExpectedValidUtxosForSwapInFallbackRefund'],
  },
  {
    args: makeArgs({utxos: [{...utxos[0], transaction_vout: -1}]}),
    description: 'Utxos are expected to have an output index',
    error: [400, 'ExpectedValidUtxosForSwapInFallbackRefund'],
  },
  {
    args: makeArgs({utxos: [{...utxos[0], transaction_vout: 2 ** 32}]}),
    description: 'Utxo output indexes are expected to be 32 bits',
    error: [400, 'ExpectedValidUtxosForSwapInFallbackRefund'],
  },
  {
    args: makeArgs({
      utxos: [
        {...utxos[0], tokens: 21e14},
        {...utxos[1], tokens: 1},
      ],
    }),
    description: 'Utxos cannot have more than all the tokens there are',
    error: [400, 'ExpectedValidUtxosForSwapInFallbackRefund'],
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
    error: [400, 'UnexpectedDuplicateUtxoForSwapInFallbackRefund'],
  },
  {
    args: makeArgs({fee_tokens_per_vbyte: 0}),
    description: 'A fee rate is expected',
    error: [400, 'ExpectedFeeRateForSwapInFallbackRefund'],
  },
  {
    args: makeArgs({hash: undefined}),
    description: 'A swap hash is expected',
    error: [400, 'ExpectedSwapHashForSwapInFallbackRefund'],
  },
  {
    args: makeArgs({key_family: undefined}),
    description: 'A key family is expected',
    error: [400, 'ExpectedKeyFamilyForSwapInFallbackRefund'],
  },
  {
    args: makeArgs({key_index: undefined}),
    description: 'A key index is expected',
    error: [400, 'ExpectedKeyIndexForSwapInFallbackRefund'],
  },
  {
    args: makeArgs({lnd: undefined}),
    description: 'An LND object is expected',
    error: [400, 'ExpectedAuthenticatedLndForSwapInFallbackRefund'],
  },
  {
    args: makeArgs({network: 'network'}),
    description: 'A known network is expected',
    error: [400, 'ExpectedKnownNetworkForSwapInFallbackRefund'],
  },
  {
    args: makeArgs({service_public_key: undefined}),
    description: 'A service HTLC key is expected',
    error: [400, 'ExpectedServiceKeyForSwapInFallbackRefund'],
  },
  {
    args: makeArgs({service_public_key: Buffer.alloc(33).toString('hex')}),
    description: 'A service HTLC key is expected to be a public key',
    error: [400, 'ExpectedServiceKeyForSwapInFallbackRefund'],
  },
  {
    args: makeArgs({sweep_address: undefined}),
    description: 'A sweep address is expected',
    error: [400, 'ExpectedSweepAddressForSwapInFallbackRefund'],
  },
  {
    args: makeArgs({timeout: undefined}),
    description: 'A timeout height is expected',
    error: [400, 'ExpectedTimeoutHeightForSwapInFallbackRefund'],
  },
  {
    args: makeArgs({timeout: 500000000}),
    description: 'A timeout is expected to be a block height',
    error: [400, 'ExpectedTimeoutHeightForSwapInFallbackRefund'],
  },
  {
    args: makeArgs({block_height: 800000.5}),
    description: 'A timelock height is expected to be a whole number',
    error: [400, 'ExpectedTimelockHeightForSwapInFallbackRefund'],
  },
  {
    args: makeArgs({block_height: 799999}),
    description: 'A timelock is expected to be at or after the HTLC timeout',
    error: [400, 'ExpectedLaterTimelockForSwapInFallbackRefund'],
  },
  {
    args: makeArgs({block_height: 500000000}),
    description: 'A timelock is expected to be a block height',
    error: [400, 'ExpectedTimelockHeightForSwapInFallbackRefund'],
  },
  {
    args: makeArgs({network: 'btctestnet'}),
    description: 'The sweep address is expected to be for the network',
    error: [400, 'ExpectedValidSweepAddressForSwapInFallbackRefund'],
  },
  {
    args: makeArgs({fee_tokens_per_vbyte: 1848}),
    description: 'A refund cannot be dust',
    error: [400, 'ExpectedMoreTokensToRefundSwapInFallback', {fee: 249480}],
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
    args: makeArgs({
      lnd: signingLnd({
        signatures: [Buffer.alloc(71, 1), Buffer.alloc(71, 1)],
      }),
    }),
    description: 'A signature is expected for every utxo',
    error: [503, 'ExpectedSignatureForEveryFallbackUtxoToRefund'],
  },
  {
    args: makeArgs({}),
    description: 'Refund a timed out swap in fallback HTLC',
    expected: refund,
  },
  {
    args: makeArgs({utxos}),
    description: 'Refund several utxos of a swap in fallback HTLC',
    expected: refundBoth,
  },
  {
    args: makeArgs({fee_tokens_per_vbyte: 1.5}),
    description: 'A fractional fee rate is rounded up to the whole fee',
    expected: refundRoundedFee,
  },
  {
    args: makeArgs({block_height: 800144}),
    description: 'A refund can be held back until after the HTLC timeout',
    expected: refundLater,
  },
];

tests.forEach(({args, description, error, expected}) => {
  return test(description, async () => {
    if (!!error) {
      await rejects(signSwapInFallbackRefund(args), error, 'Got error');
    } else {
      deepEqual(await signSwapInFallbackRefund(args), expected, 'Got refund');
    }

    return;
  });
});

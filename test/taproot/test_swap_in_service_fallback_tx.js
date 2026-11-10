const {deepEqual} = require('node:assert').strict;
const test = require('node:test');
const {throws} = require('node:assert').strict;

const method = require('./../../taproot/swap_in_service_fallback_tx');

const args = {
  utxos: [
    {
      tokens: 200000,
      transaction_id: 'c68cfb2344b36ef694e853fbeff67860fda9568f053b2f41844a8f7e7628204d',
      transaction_vout: 1,
    },
    {
      tokens: 100000,
      transaction_id: 'b17c27207b69eb7ebdf836d3425071760a8ddc72ab459d9ef6b2415ce28ca212',
      transaction_vout: 3,
    },
  ],
  fee_tokens_per_kw: 2500,
  output_script: '512096b770d763d4c483d3e7fb98381e67a3f1ed4ca4b326327140a890b20bff22a5',
  script: '21024d4b6cd1361032ca9bd2aeb9d900aa4d45d9ead80ac9423374c451a7254d0766ac6476a91479b000887626b294a914501a4cd226b58b23598388ad028403b16782012088a914fa0c2f271ca31e7b5f8a09b264eb9f70b96aa3fe8851b268',
  tokens: 251000,
};

const tests = [
  {
    args: {...args, utxos: undefined},
    description: 'Utxos are expected',
    error: 'ExpectedUtxosForServiceFallbackTx',
  },
  {
    args: {...args, utxos: []},
    description: 'At least one utxo is expected',
    error: 'ExpectedUtxosForServiceFallbackTx',
  },
  {
    args: {...args, utxos: [{tokens: 1, transaction_vout: 0}]},
    description: 'Valid utxos are expected',
    error: 'ExpectedValidUtxosForServiceFallbackTx',
  },
  {
    args: {
      ...args,
      utxos: [{...args.utxos[0], transaction_vout: 4294967296}],
    },
    description: 'Utxo output indexes are expected to be valid',
    error: 'ExpectedValidUtxosForServiceFallbackTx',
  },
  {
    args: {
      ...args,
      utxos: [
        args.utxos[0],
        {
          ...args.utxos[0],
          transaction_id: args.utxos[0].transaction_id.toUpperCase(),
        },
      ],
    },
    description: 'Utxos are expected to be unique',
    error: 'ExpectedUniqueUtxosForServiceFallbackTx',
  },
  {
    args: {...args, output_script: args.script},
    description: 'A shared address output script is expected',
    error: 'ExpectedSharedAddressOutputScriptForServiceFallbackTx',
  },
  {
    args: {...args, script: undefined},
    description: 'An HTLC script is expected',
    error: 'ExpectedHtlcScriptForServiceFallbackTx',
  },
  {
    args: {...args, tokens: undefined},
    description: 'Swap tokens are expected',
    error: 'ExpectedSwapTokensForServiceFallbackTx',
  },
  {
    args: {...args, tokens: 300001},
    description: 'Utxos have to cover the swap tokens',
    error: 'ExpectedUtxosToCoverServiceFallbackTokens',
  },
  {
    args: {...args, fee_tokens_per_kw: undefined},
    description: 'A fee rate is expected',
    error: 'ExpectedFeeRateToGetServiceFallbackFee',
  },
  {
    args: {...args, fee_tokens_per_kw: 1e6, tokens: 846},
    description: 'Swap tokens have to be above the HTLC fee',
    error: 'ExpectedSwapTokensAboveServiceFallbackFee',
  },
  {
    args: {
      ...args,
      utxos: [{...args.utxos[0], tokens: 444}],
      fee_tokens_per_kw: 1000,
      tokens: 444,
    },
    description: 'Swap tokens cannot be equal to the HTLC fee',
    error: 'ExpectedSwapTokensAboveServiceFallbackFee',
  },
  // Vectors checked against bitcoinjs-lib: structure, txid and BIP 341 hashes
  {
    args,
    description: 'HTLC transaction for two utxos with change',
    expected: {
      hashes: [
        '413d6755b5ccede1a8a0b1454674243d427a96118d0846b37b08dc781fdc952b',
        'b1ca785d83745aa099fbe901130ee8c7f6b8fa1d662838bf8cec02b006d5331f',
      ],
      id: 'f3a3401792dbc9233f74e90a998233a88767c066f2cf6e410d559bd1afc2b001',
      transaction: '02000000024d2028767e8f4a84412f3b058f56a9fd6078f6effb53e894f66eb34423fb8cc601000000000000000012a28ce25c41b2f69e9d45ab72dc8d0a76715042d336f8bd7eeb697b20277cb10300000000000000000235cc030000000000220020a56a674956f919bd4cfce5dda2d606881126d3e4082bfe53629119a8d0944b1868bf00000000000022512096b770d763d4c483d3e7fb98381e67a3f1ed4ca4b326327140a890b20bff22a500000000',
    },
  },
  {
    args: {
      utxos: [
        {
          tokens: 251000,
          transaction_id: '9b8258323d2276fec105fe14fd34d5b9970437e7e6c9b3b65a078816f7b567c6',
          transaction_vout: 0,
        },
      ],
      fee_tokens_per_kw: 1253,
      output_script: '512096b770d763d4c483d3e7fb98381e67a3f1ed4ca4b326327140a890b20bff22a5',
      script: '21024d4b6cd1361032ca9bd2aeb9d900aa4d45d9ead80ac9423374c451a7254d0766ac6476a91479b000887626b294a914501a4cd226b58b23598388ad028403b16782012088a914fa0c2f271ca31e7b5f8a09b264eb9f70b96aa3fe8851b268',
      tokens: 251000,
    },
    description: 'HTLC transaction for a single utxo without change',
    expected: {
      hashes: [
        'd542b3bcf5cc2a776ced3d0bc6ce9eb057df383e6e1c2b0e4e6e66574cfb2720',
      ],
      id: '277872154ebf8baead3ae1ef669a7538012f3d0fbed99c5b2d5ba3d474251f33',
      transaction: '0200000001c667b5f71688075ab6b3c9e6e7370497b9d534fd14fe05c1fe76223d3258829b000000000000000000014cd2030000000000220020a56a674956f919bd4cfce5dda2d606881126d3e4082bfe53629119a8d0944b1800000000',
    },
  },
  {
    args: {
      ...args,
      utxos: [{...args.utxos[0], tokens: 445}],
      fee_tokens_per_kw: 1000,
      tokens: 445,
    },
    description: 'Swap tokens can be just above the HTLC fee',
    expected: {
      hashes: [
        'b53350a4216e7fbf8a41b5cda9f4c7e07bd5d1b1a1688c6cbef5cdacc123546b',
      ],
      id: '256b4eda831844b12ace3865017900b9fc4b3962e5b6c045224d0abc5d9b2a3e',
      transaction: '02000000014d2028767e8f4a84412f3b058f56a9fd6078f6effb53e894f66eb34423fb8cc6010000000000000000010100000000000000220020a56a674956f919bd4cfce5dda2d606881126d3e4082bfe53629119a8d0944b1800000000',
    },
  },
];

tests.forEach(({args, description, error, expected}) => {
  return test(description, (t, end) => {
    if (!!error) {
      throws(() => method(args), new Error(error), 'Got expected error');
    } else {
      deepEqual(method(args), expected, 'Got expected HTLC transaction');
    }

    return end();
  });
});

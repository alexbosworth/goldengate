const {deepEqual} = require('node:assert').strict;
const {equal} = require('node:assert').strict;
const test = require('node:test');
const {throws} = require('node:assert').strict;

const {decodePsbt} = require('psbt');

const fixtures = require('./fixtures');
const {taprootCoopPsbt} = require('./../../taproot');

const makeArgs = overrides => {
  const args = {
    fee_tokens_per_vbyte: 2,
    network: 'btctestnet',
    output_script: fixtures.output_script,
    script_branches: fixtures.script_branches,
    sweep_address: fixtures.sweep_address,
    tokens: 1e6,
    transaction_id: fixtures.transaction_id,
    transaction_vout: 1,
  };

  Object.keys(overrides).forEach(k => args[k] = overrides[k]);

  return args;
};

const tests = [
  {
    args: makeArgs({}),
    description: 'A cooperative taproot PSBT is formed',
    expected: {
      hash: 'd1c13d08d4b04aeaf83e25f32b86b078b16f04c096c42212b2e70d3e90c42c58',
      psbt: '70736274ff01005202000000010cb9318f1cbe8688e71ca9e61a9b2e361d1fb47adf92ee4152d274f15cca2ebd010000000000000000017a410f0000000000160014362a2872a1c9988ef71c31bb332dfff68d895f0d00000000000103040000000001012b40420f00000000002251205417babb3f2fbe2ae11eea7e61f30dfb25b326c7090002906bc7bb8a61f15ec50000',
      transaction: '02000000010cb9318f1cbe8688e71ca9e61a9b2e361d1fb47adf92ee4152d274f15cca2ebd010000000000000000017a410f0000000000160014362a2872a1c9988ef71c31bb332dfff68d895f0d00000000',
    },
  },
  {
    args: makeArgs({fee_tokens_per_vbyte: undefined}),
    description: 'A fee rate is expected',
    error: 'ExpectedChainFeeTokensPerVbyteToGenerateTaprootCoopPsbt',
  },
  {
    args: makeArgs({network: undefined}),
    description: 'A network is expected',
    error: 'ExpectedNetworkNameToGenerateTaprootCoopPsbt',
  },
  {
    args: makeArgs({output_script: undefined}),
    description: 'A spending output script is expected',
    error: 'ExpectedSpendingOutputScriptToGenerateTaprootPsbt',
  },
  {
    args: makeArgs({script_branches: undefined}),
    description: 'Script branches are expected',
    error: 'ExpectedScriptBranchesToGenerateTaprootCoopPsbt',
  },
  {
    args: makeArgs({sweep_address: undefined}),
    description: 'A sweep address is expected',
    error: 'ExpectedSweepAddressToGenerateTaprootCoopPsbt',
  },
  {
    args: makeArgs({tokens: undefined}),
    description: 'Tokens are expected',
    error: 'ExpectedUtxoTokensValueToGenerateTaprootCoopPsbt',
  },
  {
    args: makeArgs({transaction_id: undefined}),
    description: 'A transaction id is expected',
    error: 'ExpectedTransactionIdToGenerateTaprootCoopPsbt',
  },
  {
    args: makeArgs({transaction_vout: undefined}),
    description: 'A transaction output index is expected',
    error: 'ExpectedTxOutputIndexToGenerateTaprootCoopPsbt',
  },
];

tests.forEach(({args, description, error, expected}) => {
  return test(description, (t, end) => {
    if (!!error) {
      throws(() => taprootCoopPsbt(args), new Error(error), 'Got error');

      return end();
    }

    const res = taprootCoopPsbt(args);

    deepEqual(res, expected, 'Got expected cooperative PSBT');

    const decoded = decodePsbt({psbt: res.psbt});

    const [input] = decoded.inputs;

    equal(decoded.unsigned_transaction, res.transaction, 'Got unsigned tx');
    equal(input.sighash_type, 0, 'Input uses the default sighash type');
    equal(input.witness_utxo.script_pub, args.output_script, 'Got spend');
    equal(input.witness_utxo.tokens, args.tokens, 'Got spending tokens');

    return end();
  });
});

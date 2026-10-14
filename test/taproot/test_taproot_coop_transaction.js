const {equal} = require('node:assert').strict;
const test = require('node:test');
const {throws} = require('node:assert').strict;

const {componentsOfTransaction} = require('@alexbosworth/blockchain');
const {verifySchnorr} = require('tiny-secp256k1');

const fixtures = require('./fixtures');
const {taprootCoopTransaction} = require('./../../');

const hexAsBuffer = hex => Buffer.from(hex, 'hex');
const outputKey = 'b6570f028663458205f07ef4c1f54d93205fc00604c38e57a7eb15fc5be55e3f';

const makeArgs = overrides => {
  const args = {
    fee_tokens_per_vbyte: 2,
    network: 'btctestnet',
    private_keys: fixtures.coop_private_keys,
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
    description: 'A cooperative taproot transaction is formed',
    expected: {
      sighash: '3f5dd651b6e953663e6e05573d15c2d43dd91652b3890323bb9adcfd0338d332',
      transaction: '010000000001010cb9318f1cbe8688e71ca9e61a9b2e361d1fb47adf92ee4152d274f15cca2ebd010000000000000000017a410f0000000000160014362a2872a1c9988ef71c31bb332dfff68d895f0d014033fa49913d705dddb57e534e9df738c45a664d1db96e4354ff2c02d6db2752c97da6df8b2a158a741534cafa4d12ae19f1cb767b657f62c30375c92d60d13bcc00000000',
    },
  },
  {
    args: makeArgs({
      sends: [{
        address: 'tb1qsmd28ztyvef6f4z86tpfahh2q6vl039lvt3t9m5luk7mdmpphq4sf3spnr',
        tokens: 1e5,
      }],
    }),
    description: 'A cooperative taproot transaction with a send is formed',
    expected: {
      sighash: '563d6c5c396ec29491cb9ef0df6abc9701e188105bf499b413cf5efc98b7d05b',
      transaction: '010000000001010cb9318f1cbe8688e71ca9e61a9b2e361d1fb47adf92ee4152d274f15cca2ebd0100000000000000000284ba0d0000000000160014362a2872a1c9988ef71c31bb332dfff68d895f0da08601000000000022002086daa389646653a4d447d2c29edeea0699f7c4bf62e2b2ee9fe5bdb6ec21b82b0140197fae8aaf470368646f0085910d87c5c41faec33ded05c5faf23c7fe43290e26cb2758eee52cef822a3455ad6954685c3e83b9810871ac7400e209ae77aa13800000000',
    },
  },
  {
    args: makeArgs({fee_tokens_per_vbyte: undefined}),
    description: 'A fee rate is expected',
    error: 'ExpectedChainFeeTokensPerVbyteToGenerateTaprootCoopTx',
  },
  {
    args: makeArgs({network: undefined}),
    description: 'A network is expected',
    error: 'ExpectedNetworkNameToGenerateTaprootCoopTx',
  },
  {
    args: makeArgs({private_keys: undefined}),
    description: 'Private keys are expected',
    error: 'ExpectedPrivateKeysToGenerateTaprootCoopTransaction',
  },
  {
    args: makeArgs({script_branches: undefined}),
    description: 'Script branches are expected',
    error: 'ExpectedScriptBranchesToGenerateTaprootCoopTx',
  },
  {
    args: makeArgs({sweep_address: undefined}),
    description: 'A sweep address is expected',
    error: 'ExpectedSweepAddressToGenerateTaprootCoopTransaction',
  },
  {
    args: makeArgs({tokens: undefined}),
    description: 'Tokens are expected',
    error: 'ExpectedUtxoTokensValueToGenerateTaprootCoopTx',
  },
  {
    args: makeArgs({transaction_id: undefined}),
    description: 'A transaction id is expected',
    error: 'ExpectedTransactionIdToGenerateTaprootCoopTransaction',
  },
  {
    args: makeArgs({transaction_vout: undefined}),
    description: 'A transaction output index is expected',
    error: 'ExpectedTxOutputIndexToGenerateTaprootCoopTransaction',
  },
];

tests.forEach(({args, description, error, expected}) => {
  return test(description, (t, end) => {
    if (!!error) {
      throws(() => taprootCoopTransaction(args), new Error(error), 'Error');

      return end();
    }

    const {transaction} = taprootCoopTransaction(args);

    equal(transaction, expected.transaction, 'Got expected transaction');

    const [{witness}] = componentsOfTransaction({transaction}).inputs;

    const [signature] = witness;

    const isValid = verifySchnorr(
      hexAsBuffer(expected.sighash),
      hexAsBuffer(outputKey),
      hexAsBuffer(signature)
    );

    equal(isValid, true, 'Signature is valid for the hash to sign');

    return end();
  });
});

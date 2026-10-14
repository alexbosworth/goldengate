const {equal} = require('node:assert').strict;
const test = require('node:test');
const {throws} = require('node:assert').strict;

const {componentsOfTransaction} = require('@alexbosworth/blockchain');
const {verifySchnorr} = require('tiny-secp256k1');

const fixtures = require('./fixtures');
const {taprootRefundTransaction} = require('./../../');

const baseBlockBytes = 33;
const hashBytes = 32;
const hexAsBuffer = hex => Buffer.from(hex, 'hex');
const isBlockSize = hex => !((hex.length / 2 - baseBlockBytes) % hashBytes);
const refundPublicKey = '1cb9fba5d8cbc3dad06185e49de60fac484944c3c12682b604e0261b5375d3bf';

const makeArgs = overrides => {
  const args = {
    block_height: 1571879,
    external_key: fixtures.external_key,
    fee_tokens_per_vbyte: 2,
    internal_key: fixtures.internal_key,
    network: 'btctestnet',
    output_script: fixtures.output_script,
    refund_script: fixtures.refund_script,
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
    description: 'An unsigned taproot refund transaction is formed',
    expected: {
      transaction: '01000000010cb9318f1cbe8688e71ca9e61a9b2e361d1fb47adf92ee4152d274f15cca2ebd0100000000000000000144410f0000000000160014362a2872a1c9988ef71c31bb332dfff68d895f0d27fc1700',
    },
  },
  {
    args: makeArgs({private_key: fixtures.refund_private_key}),
    description: 'A signed taproot refund transaction is formed',
    expected: {
      sighash: '53c937ec0eff1f61e726928eec7562c458b31a738b38315d938c2605a4dfc6ef',
      transaction: '010000000001010cb9318f1cbe8688e71ca9e61a9b2e361d1fb47adf92ee4152d274f15cca2ebd0100000000000000000144410f0000000000160014362a2872a1c9988ef71c31bb332dfff68d895f0d034075f921daf893321734311f3a111bb6175880722b9d1f52ff579b4f170dc8d16b0a5ad6a4d6bf3163551c90f07061cfafb88ead60024d5da2e0c721bc933d458e27201cb9fba5d8cbc3dad06185e49de60fac484944c3c12682b604e0261b5375d3bfad0327fc17b141c150929b74c1a04954b78b4b6035e97a5e078a5a0f28ec96d547bfee9ace803ac0c42e64b8f15ee335ca89fc01bbf985865e8b9afd80a22faacea20744f9bde95727fc1700',
    },
  },
  {
    args: makeArgs({fee_tokens_per_vbyte: 1.1}),
    description: 'An unsigned refund is formed with a fractional fee rate',
    expected: {
      transaction: '01000000010cb9318f1cbe8688e71ca9e61a9b2e361d1fb47adf92ee4152d274f15cca2ebd01000000000000000001b6410f0000000000160014362a2872a1c9988ef71c31bb332dfff68d895f0d27fc1700',
    },
  },
  {
    args: makeArgs({internal_key: `03${fixtures.internal_key}`}),
    description: 'A compressed internal key is used for an unsigned refund',
    expected: {
      transaction: '01000000010cb9318f1cbe8688e71ca9e61a9b2e361d1fb47adf92ee4152d274f15cca2ebd0100000000000000000144410f0000000000160014362a2872a1c9988ef71c31bb332dfff68d895f0d27fc1700',
    },
  },
  {
    args: makeArgs({
      internal_key: `03${fixtures.internal_key}`,
      private_key: fixtures.refund_private_key,
    }),
    description: 'A compressed internal key is used for a signed refund',
    expected: {
      sighash: '53c937ec0eff1f61e726928eec7562c458b31a738b38315d938c2605a4dfc6ef',
      transaction: '010000000001010cb9318f1cbe8688e71ca9e61a9b2e361d1fb47adf92ee4152d274f15cca2ebd0100000000000000000144410f0000000000160014362a2872a1c9988ef71c31bb332dfff68d895f0d034075f921daf893321734311f3a111bb6175880722b9d1f52ff579b4f170dc8d16b0a5ad6a4d6bf3163551c90f07061cfafb88ead60024d5da2e0c721bc933d458e27201cb9fba5d8cbc3dad06185e49de60fac484944c3c12682b604e0261b5375d3bfad0327fc17b141c150929b74c1a04954b78b4b6035e97a5e078a5a0f28ec96d547bfee9ace803ac0c42e64b8f15ee335ca89fc01bbf985865e8b9afd80a22faacea20744f9bde95727fc1700',
    },
  },
  {
    args: makeArgs({block_height: undefined}),
    description: 'A block height is expected',
    error: 'ExpectedLocktimeHeightForTaprootRefundTransaction',
  },
  {
    args: makeArgs({external_key: undefined}),
    description: 'An external key is expected',
    error: 'ExpectedExternalKeyForTaprootRefundTransaction',
  },
  {
    args: makeArgs({fee_tokens_per_vbyte: undefined}),
    description: 'A fee rate is expected',
    error: 'ExpectedFeeRateToUseForTaprootRefundTransaction',
  },
  {
    args: makeArgs({output_script: undefined}),
    description: 'An output script is expected',
    error: 'ExpectedOutputScriptForTaprootRefundTransaction',
  },
  {
    args: makeArgs({network: 'network'}),
    description: 'A known network is expected',
    error: 'ExpectedKnownNetworkForTaprootRefundTransaction',
  },
  {
    args: makeArgs({refund_script: undefined}),
    description: 'A refund script is expected',
    error: 'ExpectedLeafScriptForTaprootRefundTransaction',
  },
  {
    args: makeArgs({script_branches: undefined}),
    description: 'Script branches are expected',
    error: 'ExpectedScriptBranchesForTaprootRefundTransaction',
  },
  {
    args: makeArgs({sweep_address: undefined}),
    description: 'A sweep address is expected',
    error: 'ExpectedAddressForTaprootRefundTransactionToSweepOutTo',
  },
  {
    args: makeArgs({tokens: undefined}),
    description: 'Tokens are expected',
    error: 'ExpectedUtxoTokensAmountForTaprootRefundTransaction',
  },
  {
    args: makeArgs({transaction_id: undefined}),
    description: 'A transaction id is expected',
    error: 'ExpectedTransactionIdToCreateRefundTaprootTransaction',
  },
  {
    args: makeArgs({transaction_vout: undefined}),
    description: 'A transaction output index is expected',
    error: 'ExpectedTransactionVoutToCreateRefundTaprootTransaction',
  },
  {
    args: makeArgs({tokens: 100}),
    description: 'Enough tokens are expected to pay the fee',
    error: 'ExpectedMoreTokensForTaprootRefundTransaction',
  },
  {
    args: makeArgs({transaction_vout: null}),
    description: 'A number transaction output index is expected',
    error: 'ExpectedOutputIndexForEachInputToEncodeTransaction',
  },
];

tests.forEach(({args, description, error, expected}) => {
  return test(description, (t, end) => {
    if (!!error) {
      throws(() => taprootRefundTransaction(args), new Error(error), 'Error');

      return end();
    }

    const {transaction} = taprootRefundTransaction(args);

    equal(transaction, expected.transaction, 'Got expected transaction');

    // Exit early when there is no signature to check
    if (!expected.sighash) {
      return end();
    }

    const [{witness}] = componentsOfTransaction({transaction}).inputs;

    const [signature, script, control] = witness;

    equal(script, fixtures.refund_script, 'Witness has the refund script');
    equal(isBlockSize(control), true, 'Witness has a valid control block');

    const isValid = verifySchnorr(
      hexAsBuffer(expected.sighash),
      hexAsBuffer(refundPublicKey),
      hexAsBuffer(signature)
    );

    equal(isValid, true, 'Signature is valid for the hash to sign');

    return end();
  });
});

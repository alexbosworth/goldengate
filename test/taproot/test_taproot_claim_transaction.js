const {equal} = require('node:assert').strict;
const test = require('node:test');
const {throws} = require('node:assert').strict;

const {componentsOfTransaction} = require('@alexbosworth/blockchain');
const {verifySchnorr} = require('tiny-secp256k1');

const fixtures = require('./fixtures');
const {taprootClaimTransaction} = require('./../../');

const baseBlockBytes = 33;
const claimPublicKey = '9a52e5049486097409dc92b476a0c72fcc24021d2c7d3bbf91789745041a488a';
const hashBytes = 32;
const hexAsBuffer = hex => Buffer.from(hex, 'hex');
const isBlockSize = hex => !((hex.length / 2 - baseBlockBytes) % hashBytes);

const makeArgs = overrides => {
  const args = {
    block_height: 1571579,
    claim_script: fixtures.claim_script,
    external_key: fixtures.external_key,
    fee_tokens_per_vbyte: 2,
    internal_key: fixtures.internal_key,
    network: 'btctestnet',
    output_script: fixtures.output_script,
    script_branches: fixtures.script_branches,
    secret: fixtures.secret,
    sends: [],
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
    description: 'An unsigned taproot claim transaction is formed',
    expected: {
      transaction: '02000000010cb9318f1cbe8688e71ca9e61a9b2e361d1fb47adf92ee4152d274f15cca2ebd0100000000010000000128410f0000000000160014362a2872a1c9988ef71c31bb332dfff68d895f0dfbfa1700',
    },
  },
  {
    args: makeArgs({private_key: fixtures.claim_private_key}),
    description: 'A signed taproot claim transaction is formed',
    expected: {
      sighash: '8d938c8a82637646928cf5d6bad7a11ddb1b14cf8f74e716d040a485d01c2ced',
      transaction: '020000000001010cb9318f1cbe8688e71ca9e61a9b2e361d1fb47adf92ee4152d274f15cca2ebd0100000000010000000128410f0000000000160014362a2872a1c9988ef71c31bb332dfff68d895f0d0420bdb8e03b149a48e3c706663b8cee7c7590bee386d5d8b5620fd504c848437e6e40ba808ddc5a02956085e37ac7b776795b699b53ed535e6935bf7fc73025f1d318d3556132a6bafd16d6fbd88bf167c91e40724bc61fcd0ecd0a9bd8898d808e183f209a52e5049486097409dc92b476a0c72fcc24021d2c7d3bbf91789745041a488aad82012088a914c792bea2f08a4dcada80a2e848e01f236bd139278851b241c150929b74c1a04954b78b4b6035e97a5e078a5a0f28ec96d547bfee9ace803ac0099ede57cfea52ad78f14adccbe70607ac574082fd392962978a0747c724cac1fbfa1700',
    },
  },
  {
    args: makeArgs({
      private_key: fixtures.claim_private_key,
      sends: [{
        address: 'tb1qsmd28ztyvef6f4z86tpfahh2q6vl039lvt3t9m5luk7mdmpphq4sf3spnr',
        tokens: 1e5,
      }],
    }),
    description: 'A signed taproot claim transaction with a send is formed',
    expected: {
      sighash: '023f4d87071e8c56ec90b12fddf63f65a6f88f09c8ee0e454a86fa29b98decc0',
      transaction: '020000000001010cb9318f1cbe8688e71ca9e61a9b2e361d1fb47adf92ee4152d274f15cca2ebd0100000000010000000232ba0d0000000000160014362a2872a1c9988ef71c31bb332dfff68d895f0da08601000000000022002086daa389646653a4d447d2c29edeea0699f7c4bf62e2b2ee9fe5bdb6ec21b82b0420bdb8e03b149a48e3c706663b8cee7c7590bee386d5d8b5620fd504c848437e6e402892b376422ea1658358c40f555b91788f2cd2b8712264079cc9db849495930e17d224378096d80cf26023b710712964cfc9c481ddfe1de763ee977e4226478b3f209a52e5049486097409dc92b476a0c72fcc24021d2c7d3bbf91789745041a488aad82012088a914c792bea2f08a4dcada80a2e848e01f236bd139278851b241c150929b74c1a04954b78b4b6035e97a5e078a5a0f28ec96d547bfee9ace803ac0099ede57cfea52ad78f14adccbe70607ac574082fd392962978a0747c724cac1fbfa1700',
    },
  },
  {
    args: makeArgs({internal_key: `03${fixtures.internal_key}`}),
    description: 'A compressed internal key is used for an unsigned claim',
    expected: {
      transaction: '02000000010cb9318f1cbe8688e71ca9e61a9b2e361d1fb47adf92ee4152d274f15cca2ebd0100000000010000000128410f0000000000160014362a2872a1c9988ef71c31bb332dfff68d895f0dfbfa1700',
    },
  },
  {
    args: makeArgs({
      internal_key: `03${fixtures.internal_key}`,
      private_key: fixtures.claim_private_key,
    }),
    description: 'A compressed internal key is used for a signed claim',
    expected: {
      sighash: '8d938c8a82637646928cf5d6bad7a11ddb1b14cf8f74e716d040a485d01c2ced',
      transaction: '020000000001010cb9318f1cbe8688e71ca9e61a9b2e361d1fb47adf92ee4152d274f15cca2ebd0100000000010000000128410f0000000000160014362a2872a1c9988ef71c31bb332dfff68d895f0d0420bdb8e03b149a48e3c706663b8cee7c7590bee386d5d8b5620fd504c848437e6e40ba808ddc5a02956085e37ac7b776795b699b53ed535e6935bf7fc73025f1d318d3556132a6bafd16d6fbd88bf167c91e40724bc61fcd0ecd0a9bd8898d808e183f209a52e5049486097409dc92b476a0c72fcc24021d2c7d3bbf91789745041a488aad82012088a914c792bea2f08a4dcada80a2e848e01f236bd139278851b241c150929b74c1a04954b78b4b6035e97a5e078a5a0f28ec96d547bfee9ace803ac0099ede57cfea52ad78f14adccbe70607ac574082fd392962978a0747c724cac1fbfa1700',
    },
  },
  {
    args: makeArgs({block_height: undefined}),
    description: 'A block height is expected',
    error: 'ExpectedBlockHeightToGenerateTaprootClaimTransaction',
  },
  {
    args: makeArgs({claim_script: undefined}),
    description: 'A claim script is expected',
    error: 'ExpectedClaimScriptToGenerateClaimTransaction',
  },
  {
    args: makeArgs({external_key: undefined}),
    description: 'An external key is expected',
    error: 'ExpectedExternalPublicKeyToGenerateTaprootClaimTx',
  },
  {
    args: makeArgs({fee_tokens_per_vbyte: undefined}),
    description: 'A fee rate is expected',
    error: 'ExpectedChainFeeTokensPerVbyteToGenerateTaprootClaimTx',
  },
  {
    args: makeArgs({output_script: undefined}),
    description: 'An output script is expected',
    error: 'ExpectedOutputScriptToGenerateTaprootClaimTransaction',
  },
  {
    args: makeArgs({network: undefined}),
    description: 'A network is expected',
    error: 'ExpectedNetworkNameToGenerateTaprootClaimTx',
  },
  {
    args: makeArgs({script_branches: undefined}),
    description: 'Script branches are expected',
    error: 'ExpectedScriptBranchesToGenerateTaprootClaimTx',
  },
  {
    args: makeArgs({secret: undefined}),
    description: 'A preimage is expected',
    error: 'ExpectedHtlcPreimageToGenerateTaprootClaimTransaction',
  },
  {
    args: makeArgs({sends: undefined}),
    description: 'Sends are expected',
    error: 'ExpectedSendsToGenerateTaprootClaimTransaction',
  },
  {
    args: makeArgs({sweep_address: undefined}),
    description: 'A sweep address is expected',
    error: 'ExpectedSweepAddressToGenerateTaprootClaimTransaction',
  },
  {
    args: makeArgs({tokens: undefined}),
    description: 'Tokens are expected',
    error: 'ExpectedUtxoTokensValueToGenerateTaprootClaimTx',
  },
  {
    args: makeArgs({transaction_id: undefined}),
    description: 'A transaction id is expected',
    error: 'ExpectedTransactionIdToGenerateTaprootClaimTransaction',
  },
  {
    args: makeArgs({transaction_vout: undefined}),
    description: 'A transaction output index is expected',
    error: 'ExpectedTxOutputIndexToGenerateTaprootClaimTransaction',
  },
  {
    args: makeArgs({transaction_vout: 1.5}),
    description: 'A whole number transaction output index is expected',
    error: 'ExpectedOutputIndexForEachInputToEncodeTransaction',
  },
  {
    args: makeArgs({block_height: 1571579.5}),
    description: 'A whole number block height is expected',
    error: 'ExpectedLocktimeNumberToEncodeTransaction',
  },
];

tests.forEach(({args, description, error, expected}) => {
  return test(description, (t, end) => {
    if (!!error) {
      throws(() => taprootClaimTransaction(args), new Error(error), 'Error');

      return end();
    }

    const {transaction} = taprootClaimTransaction(args);

    equal(transaction, expected.transaction, 'Got expected transaction');

    // Exit early when there is no signature to check
    if (!expected.sighash) {
      return end();
    }

    const [{witness}] = componentsOfTransaction({transaction}).inputs;

    const [unlock, signature, script, control] = witness;

    equal(unlock, fixtures.secret, 'Witness has the preimage');
    equal(script, fixtures.claim_script, 'Witness has the claim script');
    equal(isBlockSize(control), true, 'Witness has a valid control block');

    const isValid = verifySchnorr(
      hexAsBuffer(expected.sighash),
      hexAsBuffer(claimPublicKey),
      hexAsBuffer(signature)
    );

    equal(isValid, true, 'Signature is valid for the hash to sign');

    return end();
  });
});

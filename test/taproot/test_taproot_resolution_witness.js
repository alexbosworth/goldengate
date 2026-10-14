const {deepEqual} = require('node:assert').strict;
const {equal} = require('node:assert').strict;
const test = require('node:test');
const {throws} = require('node:assert').strict;

const {transactionFromComponents} = require('@alexbosworth/blockchain');
const {verifySchnorr} = require('tiny-secp256k1');

const fixtures = require('./fixtures');
const method = require('./../../taproot/taproot_resolution_witness');

const hexAsBuffer = hex => Buffer.from(hex, 'hex');

const tx = transactionFromComponents({
  inputs: [{id: fixtures.transaction_id, script: '', sequence: 1, vout: 0}],
  locktime: 1571579,
  outputs: [{
    script: '0014362a2872a1c9988ef71c31bb332dfff68d895f0d',
    tokens: 9864,
  }],
  version: 2,
}).transaction;

const twoInputTx = transactionFromComponents({
  inputs: [
    {id: fixtures.transaction_id, script: '', sequence: 1, vout: 0},
    {id: fixtures.transaction_id, script: '', sequence: 1, vout: 1},
  ],
  locktime: 1571579,
  outputs: [{
    script: '0014362a2872a1c9988ef71c31bb332dfff68d895f0d',
    tokens: 9864,
  }],
  version: 2,
}).transaction;

const makeArgs = overrides => {
  const args = {
    claim_script: fixtures.claim_script,
    external_key: fixtures.external_key,
    internal_key: fixtures.internal_key,
    output_script: fixtures.output_script,
    private_key: fixtures.claim_private_key,
    script_branches: fixtures.script_branches,
    tokens: 1e4,
    transaction: tx,
    unlock: fixtures.secret,
    vin: 0,
  };

  Object.keys(overrides).forEach(k => args[k] = overrides[k]);

  return args;
};

const tests = [
  {
    args: makeArgs({}),
    description: 'A claim path witness is derived',
    expected: {
      sighash: '54e2214e25a781a7e49ce7ae7234a4708d4096f2ea80c412cc42942a1eea4547',
      signature_index: 1,
      signing_key: '9a52e5049486097409dc92b476a0c72fcc24021d2c7d3bbf91789745041a488a',
      witness: [
        fixtures.secret,
        '197dd4b3c25de02dfaf118bb9befc60599634123cee79c00699510af58429a3e8986ef46f5d53a34fb2de7ea33d5c4b235c2f90a4d689db627c7497971f5896a',
        fixtures.claim_script,
        'c150929b74c1a04954b78b4b6035e97a5e078a5a0f28ec96d547bfee9ace803ac0099ede57cfea52ad78f14adccbe70607ac574082fd392962978a0747c724cac1',
      ],
    },
  },
  {
    args: makeArgs({
      claim_script: undefined,
      private_key: fixtures.refund_private_key,
      refund_script: fixtures.refund_script,
      unlock: undefined,
    }),
    description: 'A refund path witness is derived',
    expected: {
      sighash: '5b3a3b38d14517b4165d1617d46d68fc556d56a4853ca6046db6793133aef1ec',
      signature_index: 0,
      signing_key: '1cb9fba5d8cbc3dad06185e49de60fac484944c3c12682b604e0261b5375d3bf',
      witness: [
        '1808e154d98d304717223f21964e0d21abd6959abd796aa88633f0bb6b1cae7946183192f56a5fe7a635462811c058e46cd27c37a666c2c3bad72ac6a22e0efd',
        fixtures.refund_script,
        'c150929b74c1a04954b78b4b6035e97a5e078a5a0f28ec96d547bfee9ace803ac0c42e64b8f15ee335ca89fc01bbf985865e8b9afd80a22faacea20744f9bde957',
      ],
    },
  },
  {
    args: makeArgs({claim_script: undefined, unlock: undefined}),
    description: 'A key path witness is derived',
    expected: {
      sighash: '0bc0e05098d29f2e0b154df7afb6c5194767bc17b9f7d99911063970a345eb00',
      signature_index: 0,
      signing_key: '25fa57056fd79b6e489fcdb4df720ca5a00b6c87499159b8963086edd0536e1a',
      witness: [
        '54848d457e06ddef302fb25ca3e6999fc4e5e57e13189c70312290a9e174a8556c4fde58e60f831278ca71e8374c49e15076ca4c541c922fcbde2899eaf2fe8d',
      ],
    },
  },
  {
    args: makeArgs({internal_key: `03${fixtures.internal_key}`}),
    description: 'A compressed internal key is used for a claim witness',
    expected: {
      sighash: '54e2214e25a781a7e49ce7ae7234a4708d4096f2ea80c412cc42942a1eea4547',
      signature_index: 1,
      signing_key: '9a52e5049486097409dc92b476a0c72fcc24021d2c7d3bbf91789745041a488a',
      witness: [
        fixtures.secret,
        '197dd4b3c25de02dfaf118bb9befc60599634123cee79c00699510af58429a3e8986ef46f5d53a34fb2de7ea33d5c4b235c2f90a4d689db627c7497971f5896a',
        fixtures.claim_script,
        'c150929b74c1a04954b78b4b6035e97a5e078a5a0f28ec96d547bfee9ace803ac0099ede57cfea52ad78f14adccbe70607ac574082fd392962978a0747c724cac1',
      ],
    },
  },
  {
    args: makeArgs({
      claim_script: undefined,
      internal_key: `03${fixtures.internal_key}`,
      private_key: fixtures.refund_private_key,
      refund_script: fixtures.refund_script,
      unlock: undefined,
    }),
    description: 'A compressed internal key is used for a refund witness',
    expected: {
      sighash: '5b3a3b38d14517b4165d1617d46d68fc556d56a4853ca6046db6793133aef1ec',
      signature_index: 0,
      signing_key: '1cb9fba5d8cbc3dad06185e49de60fac484944c3c12682b604e0261b5375d3bf',
      witness: [
        '1808e154d98d304717223f21964e0d21abd6959abd796aa88633f0bb6b1cae7946183192f56a5fe7a635462811c058e46cd27c37a666c2c3bad72ac6a22e0efd',
        fixtures.refund_script,
        'c150929b74c1a04954b78b4b6035e97a5e078a5a0f28ec96d547bfee9ace803ac0c42e64b8f15ee335ca89fc01bbf985865e8b9afd80a22faacea20744f9bde957',
      ],
    },
  },
  {
    args: makeArgs({external_key: undefined}),
    description: 'An external key is expected for a claim',
    error: 'ExpectedExternalKeyToDeriveClaimScriptWitness',
  },
  {
    args: makeArgs({script_branches: undefined}),
    description: 'Script branches are expected for a claim',
    error: 'ExpectedScriptBranchesToDeriveClaimScriptWitness',
  },
  {
    args: makeArgs({unlock: undefined}),
    description: 'An unlock preimage is expected for a claim',
    error: 'ExpectedUnlockPreimageToDeriveClaimScriptWitness',
  },
  {
    args: makeArgs({output_script: undefined}),
    description: 'The spending output script is expected',
    error: 'ExpectedSpendingOutpointOutputScriptForTaprootWitness',
  },
  {
    args: makeArgs({private_key: undefined}),
    description: 'A private key is expected',
    error: 'ExpectedSpendingPrivateKeyToGenerateTaprootWitnessStack',
  },
  {
    args: makeArgs({
      claim_script: undefined,
      external_key: undefined,
      refund_script: fixtures.refund_script,
    }),
    description: 'An external key is expected for a refund',
    error: 'ExpectedExternalKeyToDeriveRefundScriptWitnessStack',
  },
  {
    args: makeArgs({
      claim_script: undefined,
      refund_script: fixtures.refund_script,
      script_branches: undefined,
    }),
    description: 'Script branches are expected for a refund',
    error: 'ExpectedScriptBranchesToDeriveRefundScriptWitness',
  },
  {
    args: makeArgs({tokens: undefined}),
    description: 'Spending tokens are expected',
    error: 'ExpectedInputTokensValueToDeriveTaprootWitnessStack',
  },
  {
    args: makeArgs({transaction: undefined}),
    description: 'A transaction is expected',
    error: 'ExpectedRawTransactionToSignToDeriveTaprootWitnessStack',
  },
  {
    args: makeArgs({vin: undefined}),
    description: 'An input index is expected',
    error: 'ExpectedInputIndexToSignToGenerateResolutionWitness',
  },
  {
    args: makeArgs({transaction: twoInputTx}),
    description: 'Every input is expected to have a known spending output',
    error: 'ExpectedSpendForEveryInputToDeriveTaprootWitnessStack',
  },
];

tests.forEach(({args, description, error, expected}) => {
  return test(description, (t, end) => {
    if (!!error) {
      throws(() => method(args), new Error(error), 'Got expected error');

      return end();
    }

    const {witness} = method(args);

    deepEqual(witness, expected.witness, 'Got expected witness stack');

    const isValid = verifySchnorr(
      hexAsBuffer(expected.sighash),
      hexAsBuffer(expected.signing_key),
      hexAsBuffer(witness[expected.signature_index])
    );

    equal(isValid, true, 'Signature is valid for the hash to sign');

    return end();
  });
});

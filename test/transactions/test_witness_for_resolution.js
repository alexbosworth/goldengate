const {deepEqual} = require('node:assert').strict;
const {equal} = require('node:assert').strict;
const test = require('node:test');
const {throws} = require('node:assert').strict;

const {OP_FALSE} = require('bitcoin-ops');
const {transactionFromComponents} = require('@alexbosworth/blockchain');
const {verify} = require('tiny-secp256k1');

const method = require('./../../transactions/witness_for_resolution');
const {swapScript} = require('./../../script');

const asScalar = n => Buffer.concat([Buffer.alloc(32), n]).subarray(-32);
const claimPublicKey = '039a52e5049486097409dc92b476a0c72fcc24021d2c7d3bbf91789745041a488a';
const derHeaderLength = 2;
const derValue = n => n.subarray(derHeaderLength, derHeaderLength + n[1]);
const hexAsBuffer = hex => Buffer.from(hex, 'hex');
const maxSequence = 0xffffffff;
const refundPrivateKey = '79957dc2091c8b024e14ee7f338869174ae39674342f40cc804cb099145d1d97';
const refundPublicKey = '031cb9fba5d8cbc3dad06185e49de60fac484944c3c12682b604e0261b5375d3bf';
const secret = 'bdb8e03b149a48e3c706663b8cee7c7590bee386d5d8b5620fd504c848437e6e';
const v1SwapScript = '8201208763a914c792bea2f08a4dcada80a2e848e01f236bd139278821039a52e5049486097409dc92b476a0c72fcc24021d2c7d3bbf91789745041a488a67750327fc17b17521031cb9fba5d8cbc3dad06185e49de60fac484944c3c12682b604e0261b5375d3bf68ac';
const v2SwapScript = '21039a52e5049486097409dc92b476a0c72fcc24021d2c7d3bbf91789745041a488aac6476a914382f1ac022fce4ff91259403111a6ebaf1e4831a88ad0327fc17b16782012088a914c792bea2f08a4dcada80a2e848e01f236bd139278851b268';

const derAsCompact = der => {
  const sequence = derValue(hexAsBuffer(der));

  const r = derValue(sequence);

  // The S integer follows the R integer header and value
  const s = derValue(sequence.subarray(derHeaderLength + r.length));

  return Buffer.concat([asScalar(r), asScalar(s)]);
};

const emptyTx = transactionFromComponents({
  inputs: [],
  locktime: 0,
  outputs: [],
  version: 1,
}).transaction;

const tx = transactionFromComponents({
  inputs: [{
    id: Buffer.alloc(32).toString('hex'),
    script: String(),
    sequence: maxSequence,
    vout: 0,
  }],
  locktime: 0,
  outputs: [],
  version: 1,
}).transaction;

const makeArgs = overrides => {
  const args = {
    private_key: '4af38565a8bb19480057f375400105fcfb3b6534c32fbc1039df496421012b0d',
    tokens: 1e4,
    transaction: tx,
    unlock: Buffer.alloc(32).toString('hex'),
    vin: 0,
    witness_script: true,
  };

  Object.keys(overrides).forEach(k => args[k] = overrides[k]);

  return args;
};

const tests = [
  {
    args: makeArgs({}),
    description: 'Derive witness for resolution',
    expected: {
      witness_unlock: Buffer.alloc(32).toString('hex'),
    },
  },
  {
    args: makeArgs({
      witness_script: '21031cb9fba5d8cbc3dad06185e49de60fac484944c3c12682b604e0261b5375d3bfac6476a914f848f45b3156887fef19906babb85af645735d4e88ad038a2017b16782012088a914c792bea2f08a4dcada80a2e848e01f236bd139278851b268',
    }),
    description: 'Derive v2 claim witness for resolution',
    expected: {
      version: 2,
      witness_script: '00',
      witness_unlock: Buffer.alloc(32).toString('hex'),
    },
  },
  {
    args: makeArgs({
      public_key: '02e16102ea3eff7b31c2ad4b82a665d8bcde514119f8977779d2729c3852beaa44',
      unlock: OP_FALSE.toString(16),
      witness_script: '21031cb9fba5d8cbc3dad06185e49de60fac484944c3c12682b604e0261b5375d3bfac6476a914f848f45b3156887fef19906babb85af645735d4e88ad038a2017b16782012088a914c792bea2f08a4dcada80a2e848e01f236bd139278851b268',
    }),
    description: 'Derive v2 refund witness for resolution',
    expected: {
      version: 2,
      witness_script: '01',
      witness_unlock: Buffer.alloc(32).toString('hex'),
    },
  },
  {
    args: makeArgs({unlock: secret, witness_script: v1SwapScript}),
    description: 'Derive signed v1 claim witness for resolution',
    expected: {
      public_key: claimPublicKey,
      sighash: '4037f33f6bbdd2d744fe81073ec970fdd07b677f3421c78556195b4cf0972ff4',
      signature_index: 0,
      witness: [
        '304402201e95daf7ba694118af53bddc1ad3d232177608888a22751338f32963a515a52302202b0eef0bbe35689cce708531589772ed46bec322e62eaf6c59791951965e845c01',
        secret,
        v1SwapScript,
      ],
      witness_script: v1SwapScript,
      witness_unlock: secret,
    },
  },
  {
    args: makeArgs({unlock: secret, witness_script: v2SwapScript}),
    description: 'Derive signed v2 claim witness for resolution',
    expected: {
      public_key: claimPublicKey,
      sighash: '6badba13ebe30e9376596806bceced56829fd6162e27ab34c07c57b2174e799a',
      signature_index: 1,
      version: 2,
      witness: [
        secret,
        '3045022100cbdb8b86250888f27a587315242b68dddf249c35fa1be0b2fb66f7f684c62246022001d56bd1f626ae84119675b4ac8df267bb8eac4f5d0dd2d6b65663b8e4631ae801',
        v2SwapScript,
      ],
      witness_script: v2SwapScript,
      witness_unlock: secret,
    },
  },
  {
    args: makeArgs({
      private_key: refundPrivateKey,
      unlock: '00',
      witness_script: v2SwapScript,
    }),
    description: 'Derive signed v2 refund witness for resolution',
    expected: {
      public_key: refundPublicKey,
      sighash: '6badba13ebe30e9376596806bceced56829fd6162e27ab34c07c57b2174e799a',
      signature_index: 0,
      version: 2,
      witness: [
        '30450221009eeaf8c424cf7d5d21bac9e928f936b5bbc80f17c3dd7a8a2cbf844edb965e36022014558d65af69f465e2a221f619242bf18f1807641a5035b5a0ab3a4363d2301701',
        refundPublicKey,
        '00',
        v2SwapScript,
      ],
      witness_script: v2SwapScript,
      witness_unlock: '00',
    },
  },
  {
    args: makeArgs({private_key: undefined}),
    description: 'Requires private key for signing',
    error: 'ExpectedPrivateKeyForResolutionTransactionWitness',
  },
  {
    args: makeArgs({tokens: undefined}),
    description: 'Requires previous output tokens for signing',
    error: 'ExpectedTokensForResolutionTransactionWitness',
  },
  {
    args: makeArgs({transaction: undefined}),
    description: 'Requires tx for witness signing',
    error: 'ExpectedTransactionForWitnessGeneration',
  },
  {
    args: makeArgs({unlock: undefined}),
    description: 'Requires unlock for witness signing',
    error: 'ExpectedUnlockElementForResolutionTransactionWitness',
  },
  {
    args: makeArgs({vin: undefined}),
    description: 'Requires vin for witness signing',
    error: 'ExpectedInputIndexNumberForResolutionTransactionWitness',
  },
  {
    args: makeArgs({witness_script: undefined}),
    description: 'Requires witness script for witness signing',
    error: 'ExpectedWitnessScriptForResolutionTransactionWitness',
  },
  {
    args: makeArgs({transaction: emptyTx}),
    description: 'Require transaction with input for witness signing',
    error: 'ExpectedInputToSignForResolutionTransactionWitness',
  },
  {
    args: makeArgs({transaction: '00'}),
    description: 'Require valid transaction for witness signing',
    error: 'ExpectedValidTransactionHexForWitnessGeneration',
  },
  {
    args: makeArgs({witness_script: '00'}),
    description: 'Require known witness script for witness signing',
    error: 'ExpectedKnownSwapScriptTypeToDeriveResolutionWitness',
  },
];

tests.forEach(({args, description, error, expected}) => {
  return test(description, async () => {
    if (args.witness_script === true) {
      const {script} = swapScript({
        claim_private_key: '79957dc2091c8b024e14ee7f338869174ae39674342f40cc804cb099145d1d97',
        secret: 'bdb8e03b149a48e3c706663b8cee7c7590bee386d5d8b5620fd504c848437e6e',
        refund_public_key: '027e919ee986cd0ad6e012932c709e82396321a82faee5355ca5def9d0934b526c',
        timeout: 1515658,
      });

      args.witness_script = script;

      if (!error) {
        expected.witness_script = script;
      }
    }

    if (!!error) {
      throws(() => method(args), new Error(error));

      return;
    }

    const {witness} = method(args);

    if (!expected.version) {
      const [sig, unlock, script] = witness;

      equal(sig.length > 70, true, 'Signature returned');
      equal(unlock, expected.witness_unlock, 'Unlock data returned');
      equal(script, expected.witness_script, 'Swap script returned');
    } else if (expected.version === 2 && args.unlock.length === 32) {
      const [unlock, sig, script] = witness;

      equal(sig.length > 70, true, 'V2 claim signature returned');
      equal(unlock, expected.witness_unlock, 'V2 claim unlock data returned');
      equal(script, expected.witness_script, 'V2 claim swap script returned');
    } else if (expected.version === 2 && !args.unlock.length) {
      const [sig, publicKey, unlock, script] = witness;

      equal(sig.length > 70, true, 'V2 refund signature returned');
      equal(publicKey, expected.public_key, 'V2 refund public key returned');
      equal(unlock, expected.witness_unlock, 'V2 refund unlock data returned');
      equal(script, expected.witness_script, 'V2 swap unlock script returned');
    }

    // Exit early when there is no signature to check
    if (!expected.sighash) {
      return;
    }

    const isValid = verify(
      hexAsBuffer(expected.sighash),
      hexAsBuffer(expected.public_key),
      derAsCompact(witness[expected.signature_index])
    );

    deepEqual(witness, expected.witness, 'Got expected witness stack');
    equal(isValid, true, 'Signature is valid for the hash to sign');

    return;
  });
});

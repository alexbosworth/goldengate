const {ECPair} = require('bitcoinjs-lib');
const {OP_FALSE} = require('bitcoin-ops');
const {test} = require('tap');
const {Transaction} = require('bitcoinjs-lib');

const method = require('./../../transactions/witness_for_resolution');
const {swapScript} = require('./../../script');

const key = ECPair.makeRandom();
const tx = new Transaction();

const {script} = swapScript({
  claim_private_key: '79957dc2091c8b024e14ee7f338869174ae39674342f40cc804cb099145d1d97',
  secret: 'bdb8e03b149a48e3c706663b8cee7c7590bee386d5d8b5620fd504c848437e6e',
  refund_public_key: '027e919ee986cd0ad6e012932c709e82396321a82faee5355ca5def9d0934b526c',
  timeout: 1515658,
});

tx.addInput(Buffer.alloc(32), 0);

const makeArgs = overrides => {
  const args = {
    private_key: key.privateKey.toString('hex'),
    tokens: 1e4,
    transaction: tx.toHex(),
    unlock: Buffer.alloc(32).toString('hex'),
    vin: 0,
    witness_script: script,
  };

  Object.keys(overrides).forEach(k => args[k] = overrides[k]);

  return args;
};

const tests = [
  {
    args: makeArgs({}),
    description: 'Derive witness for resolution',
    expected: {
      witness_script: script,
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
    args: makeArgs({transaction: new Transaction().toHex()}),
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
  return test(description, ({equal, end, throws}) => {
    if (!!error) {
      throws(() => method(args), new Error(error));

      return end();
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

    return end();
  });
});

const {ECPair} = require('bitcoinjs-lib');
const {test} = require('@alexbosworth/tap');
const {Transaction} = require('bitcoinjs-lib');

const {swapScript} = require('./../../script');
const witnessForResolution = require('./../../transactions/witness_for_resolution');

const key = ECPair.makeRandom();
const tx = new Transaction();

const {script} = swapScript({
  claim_private_key: '79957dc2091c8b024e14ee7f338869174ae39674342f40cc804cb099145d1d97',
  secret: 'bdb8e03b149a48e3c706663b8cee7c7590bee386d5d8b5620fd504c848437e6e',
  refund_public_key: '027e919ee986cd0ad6e012932c709e82396321a82faee5355ca5def9d0934b526c',
  timeout: 1515658,
});

tx.addInput(Buffer.alloc(32), 0);

const tests = [
  {
    args: {
      private_key: key.privateKey.toString('hex'),
      tokens: 1e4,
      transaction: tx.toHex(),
      unlock: Buffer.alloc(32).toString('hex'),
      vin: 0,
      witness_script: script,
    },
    description: 'Derive witness for resolution',
    expected: {
      witness_script: script,
      witness_unlock: Buffer.alloc(32).toString('hex'),
    },
  },
  {
    args: {},
    description: 'Requires private key for signing',
    error: 'ExpectedPrivateKeyForResolutionTransactionWitness',
  },
  {
    args: {private_key: key.privateKey.toString('hex')},
    description: 'Requires previous output tokens for signing',
    error: 'ExpectedTokensForResolutionTransactionWitness',
  },
  {
    args: {private_key: key.privateKey.toString('hex'), tokens: 1},
    description: 'Requires tx for witness signing',
    error: 'ExpectedTransactionForWitnessGeneration',
  },
  {
    args: {
      private_key: key.privateKey.toString('hex'),
      tokens: 1,
      transaction: tx.toHex(),
    },
    description: 'Requires unlock for witness signing',
    error: 'ExpectedUnlockElementForResolutionTransactionWitness',
  },
  {
    args: {
      private_key: key.privateKey.toString('hex'),
      tokens: 1,
      transaction: tx.toHex(),
      unlock: Buffer.alloc(32).toString('hex'),
    },
    description: 'Requires vin for witness signing',
    error: 'ExpectedInputIndexNumberForResolutionTransactionWitness',
  },
  {
    args: {
      private_key: key.privateKey.toString('hex'),
      tokens: 1,
      transaction: tx.toHex(),
      unlock: Buffer.alloc(32).toString('hex'),
      vin: 0,
    },
    description: 'Requires witness script for witness signing',
    error: 'ExpectedWitnessScriptForResolutionTransactionWitness',
  },
  {
    args: {
      private_key: key.privateKey.toString('hex'),
      tokens: 1e4,
      transaction: new Transaction().toHex(),
      unlock: Buffer.alloc(32).toString('hex'),
      vin: 0,
      witness_script: script,
    },
    description: 'Require transaction with input for witness signing',
    error: 'ExpectedInputToSignForResolutionTransactionWitness',
  },
  {
    args: {
      private_key: key.privateKey.toString('hex'),
      tokens: 1e4,
      transaction: '00',
      unlock: Buffer.alloc(32).toString('hex'),
      vin: 0,
      witness_script: script,
    },
    description: 'Require valid transaction for witness signing',
    error: 'ExpectedValidTransactionHexForWitnessGeneration',
  },
];

tests.forEach(({args, description, error, expected}) => {
  return test(description, ({equal, end, throws}) => {
    if (!!error) {
      throws(() => witnessForResolution(args), new Error(error));

      return end();
    }

    const {witness} = witnessForResolution(args);

    const [sig, unlock, script] = witness;

    equal(sig.length > 70, true, 'Signature returned');
    equal(unlock, expected.witness_unlock, 'Unlock data returned');
    equal(script, expected.witness_script, 'Swap script returned');

    return end();
  });
});

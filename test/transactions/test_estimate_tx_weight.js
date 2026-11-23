const {equal} = require('node:assert').strict;
const test = require('node:test');
const {throws} = require('node:assert').strict;

const estimateTxWeight = require('./../../transactions/estimate_tx_weight');

const swapScript = '21031cb9fba5d8cbc3dad06185e49de60fac484944c3c12682b604e0261b5375d3bfac6476a914f848f45b3156887fef19906babb85af645735d4e88ad038a2017b16782012088a914c792bea2f08a4dcada80a2e848e01f236bd139278851b268';

const makeArgs = overrides => {
  const args = {
    unlock: '00',
    weight: 1,
    witness_script: swapScript,
  };

  Object.keys(overrides).forEach(k => args[k] = overrides[k]);

  return args;
};

const tests = [
  {
    args: makeArgs({unlock: undefined}),
    description: 'An unlock element is required',
    error: 'ExpectedUnlockElementForTxWeightEstimation',
  },
  {
    args: makeArgs({weight: undefined}),
    description: 'An unsigned weight total is required',
    error: 'ExpectedUnsignedTxWeightToEstimateSignedTxWeight',
  },
  {
    args: makeArgs({witness_script: undefined}),
    description: 'A witness script is required',
    error: 'ExpectedWitnessScriptForTxWeightEstimation',
  },
  {
    args: makeArgs({witness_script: '00'}),
    description: 'A known witness script type is required',
    error: 'ExpectedKnownWitnessScriptForTxWeightEstimation',
  },
  {
    args: makeArgs({}),
    description: 'A swap script for a refund returns a weight estimate',
    expected: {weight: 210},
  },
  {
    args: makeArgs({
      unlock: Buffer.alloc(32).toString('hex'),
    }),
    description: 'A swap script for a claim returns a weight estimate',
    expected: {weight: 208},
  },
];

tests.forEach(({args, description, error, expected}) => {
  return test(description, (t, end) => {
    if (!!error) {
      throws(() => estimateTxWeight(args), new Error(error), 'Got error');
    } else {
      equal(estimateTxWeight(args).weight, expected.weight, 'Got weight');
    }

    return end();
  });
});

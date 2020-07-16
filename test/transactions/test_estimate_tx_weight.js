const {test} = require('@alexbosworth/tap');

const estimateTxWeight = require('./../../transactions/estimate_tx_weight');

const tests = [
  {
    args: {},
    description: 'An unlock element is required',
    error: 'ExpectedUnlockElementForTxWeightEstimation',
  },
  {
    args: {unlock: '00'},
    description: 'An unsigned weight total is required',
    error: 'ExpectedUnsignedTxWeightToEstimateSignedTxWeight',
  },
  {
    args: {unlock: '00', weight: 1},
    description: 'A witness script is required',
    error: 'ExpectedWitnessScriptForTxWeightEstimation',
  },
  {
    args: {unlock: '00', weight: 1, witness_script: '00'},
    description: 'A witness script is required',
    expected: {weight: 81},
  },
];

tests.forEach(({args, description, error, expected}) => {
  return test(description, ({equal, end, throws}) => {
    if (!!error) {
      throws(() => estimateTxWeight(args), new Error(error), 'Got error');

      return end();
    }

    equal(estimateTxWeight(args).weight, expected.weight, 'Got weight');

    return end();
  });
});

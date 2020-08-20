const {test} = require('tap');

const estimateTxWeight = require('./../../transactions/estimate_tx_weight');

const makeArgs = overrides => {
  const args = {
    unlock: '00',
    weight: 1,
    witness_script: '8201208763a914c792bea2f08a4dcada80a2e848e01f236bd139278821031cb9fba5d8cbc3dad06185e49de60fac484944c3c12682b604e0261b5375d3bf6775038a2017b17521027e919ee986cd0ad6e012932c709e82396321a82faee5355ca5def9d0934b526c68ac',
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
    description: 'A witness script returns a weight estimate',
    expected: {weight: 186},
  },
  {
    args: makeArgs({
      witness_script: '21031cb9fba5d8cbc3dad06185e49de60fac484944c3c12682b604e0261b5375d3bfac6476a914f848f45b3156887fef19906babb85af645735d4e88ad038a2017b16782012088a914c792bea2f08a4dcada80a2e848e01f236bd139278851b268',
    }),
    description: 'A witness v2 script for a refund returns a weight estimate',
    expected: {weight: 210},
  },
  {
    args: makeArgs({
      unlock: Buffer.alloc(32).toString('hex'),
      witness_script: '21031cb9fba5d8cbc3dad06185e49de60fac484944c3c12682b604e0261b5375d3bfac6476a914f848f45b3156887fef19906babb85af645735d4e88ad038a2017b16782012088a914c792bea2f08a4dcada80a2e848e01f236bd139278851b268',
    }),
    description: 'A witness v2 script for a claim returns a weight estimate',
    expected: {weight: 208},
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

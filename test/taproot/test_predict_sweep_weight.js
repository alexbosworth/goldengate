const {deepEqual} = require('node:assert').strict;
const test = require('node:test');
const {throws} = require('node:assert').strict;

const fixtures = require('./fixtures');
const method = require('./../../taproot/predict_sweep_weight');

const makeArgs = overrides => {
  const args = {
    control: '00'.repeat(65),
    script: fixtures.claim_script,
    unlock: fixtures.secret,
    weight: 328,
  };

  Object.keys(overrides).forEach(k => args[k] = overrides[k]);

  return args;
};

const tests = [
  {
    args: makeArgs({weight: undefined}),
    description: 'An unsigned weight is expected',
    error: 'ExpectedUnsignedTxWeightToPredictSignedTxWeight',
  },
  {
    args: makeArgs({control: undefined}),
    description: 'A control block is expected for a script path spend',
    error: 'ExpectedControlBlockToPredictSignedTxWeight',
  },
  {
    args: makeArgs({script: undefined}),
    description: 'A leaf script is expected for a claim path spend',
    error: 'ExpectedLeafScriptToPredictSignedTxWeight',
  },
  {
    args: makeArgs({}),
    description: 'Weight is predicted for a claim path spend',
    expected: {weight: 559},
  },
  {
    args: makeArgs({script: fixtures.refund_script, unlock: undefined}),
    description: 'Weight is predicted for a timeout path spend',
    expected: {weight: 502},
  },
  {
    args: makeArgs({control: undefined, script: undefined}),
    description: 'Weight is predicted for a key path spend',
    expected: {weight: 396},
  },
];

tests.forEach(({args, description, error, expected}) => {
  return test(description, (t, end) => {
    if (!!error) {
      throws(() => method(args), new Error(error), 'Got expected error');
    } else {
      deepEqual(method(args), expected, 'Got expected result');
    }

    return end();
  });
});

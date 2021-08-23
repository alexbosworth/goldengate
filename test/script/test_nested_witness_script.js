const {test} = require('@alexbosworth/tap');

const {nestedWitnessScript} = require('./../../script');

const tests = [
  {
    args: {
      witness_script: '8201208763a914d1a70126ff7a149ca6f9b638db084480440ff8428821000000000000000000000000000000000000000000000000000000000000000000677503fbfa17b175210280a5a994052abe443adb74851387b389386306c690a94ddf3bfd71234cd2a72b68ac',
    },
    description: 'Nested redeem script returned for witness script',
    expected: {
      redeem_script: '2200206f569f1dcbb18b78883398b66a52c7c50938119ed4567cc3c2e5bb6d7b36c650',
    },
  },
  {
    args: {},
    description: 'Getting nested redeem script requires a witness script',
    error: 'ExpectedWitnessProgramToCreatedNestedScriptSig',
  },
];

tests.forEach(({args, description, error, expected}) => {
  return test(description, ({end, equal, throws}) => {
    if (!!error) {
      throws(() => nestedWitnessScript(args), new Error(error), 'Got error');

      return end();
    }

    const nested = nestedWitnessScript(args);

    equal(nested.redeem_script, expected.redeem_script, 'Got redeem script');

    return end();
  });
});

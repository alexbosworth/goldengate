const {test} = require('@alexbosworth/tap');

const isSwapScriptV1 = require('./../../script/is_swap_script_v1');

const tests = [
  {
    args: {},
    description: 'A script is expected',
    error: 'ExpectedWitnessScriptToDetermineIfScriptIsV1SwapScript'
  },
];

tests.forEach(({args, description, error, expected}) => {
  return test(description, ({equal, end, throws}) => {
    if (!!error) {
      throws(() => isSwapScriptV1(args), new Error(error), 'Got error');
    } else {
      const is = isSwapScriptV1(args);

      equal(is, expected, 'Got expected version');
    }

    return end();
  });
});

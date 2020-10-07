const {test} = require('tap');

const isSwapScriptV2 = require('./../../script/is_swap_script_v2');

const tests = [
  {
    args: {},
    description: 'A script is expected',
    error: 'ExpectedWitnessScriptToDetermineIfScriptIsV2SwapScript'
  },
];

tests.forEach(({args, description, error, expected}) => {
  return test(description, ({equal, end, throws}) => {
    if (!!error) {
      throws(() => isSwapScriptV2(args), new Error(error), 'Got error');
    } else {
      const is = isSwapScriptV2(args);

      equal(is, expected, 'Got expected version');
    }

    return end();
  });
});

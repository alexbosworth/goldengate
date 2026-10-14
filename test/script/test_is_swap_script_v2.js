const {equal} = require('node:assert').strict;
const test = require('node:test');
const {throws} = require('node:assert').strict;

const isSwapScriptV2 = require('./../../script/is_swap_script_v2');

const tests = [
  {
    args: {},
    description: 'A script is expected',
    error: 'ExpectedWitnessScriptToDetermineIfScriptIsV2SwapScript'
  },
  {
    args: {
      script: '21039a52e5049486097409dc92b476a0c72fcc24021d2c7d3bbf91789745041a488aac6476a914382f1ac022fce4ff91259403111a6ebaf1e4831a88ad0327fc17b16782012088a914c792bea2f08a4dcada80a2e848e01f236bd139278851b268',
    },
    description: 'A v2 swap script is a v2 swap script',
    expected: true,
  },
  {
    args: {
      script: '00ac6476a914382f1ac022fce4ff91259403111a6ebaf1e4831a88ad0327fc17b16782012088a914c792bea2f08a4dcada80a2e848e01f236bd139278851b268',
    },
    description: 'A swap script with an empty claim key is not a swap script',
    expected: false,
  },
  {
    args: {
      script: '8201208763a914c792bea2f08a4dcada80a2e848e01f236bd139278821039a52e5049486097409dc92b476a0c72fcc24021d2c7d3bbf91789745041a488a67750327fc17b17521031cb9fba5d8cbc3dad06185e49de60fac484944c3c12682b604e0261b5375d3bf68ac',
    },
    description: 'A v1 swap script is not a v2 swap script',
    expected: false,
  },
];

tests.forEach(({args, description, error, expected}) => {
  return test(description, (t, end) => {
    if (!!error) {
      throws(() => isSwapScriptV2(args), new Error(error), 'Got error');
    } else {
      const is = isSwapScriptV2(args);

      equal(is, expected, 'Got expected version');
    }

    return end();
  });
});

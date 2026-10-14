const {equal} = require('node:assert').strict;
const test = require('node:test');
const {throws} = require('node:assert').strict;

const isSwapScriptV1 = require('./../../script/is_swap_script_v1');

const tests = [
  {
    args: {},
    description: 'A script is expected',
    error: 'ExpectedWitnessScriptToDetermineIfScriptIsV1SwapScript'
  },
  {
    args: {
      script: '8201208763a914c792bea2f08a4dcada80a2e848e01f236bd139278821039a52e5049486097409dc92b476a0c72fcc24021d2c7d3bbf91789745041a488a67750327fc17b17521031cb9fba5d8cbc3dad06185e49de60fac484944c3c12682b604e0261b5375d3bf68ac',
    },
    description: 'A v1 swap script is a v1 swap script',
    expected: true,
  },
  {
    args: {
      script: '8201208763a914c792bea2f08a4dcada80a2e848e01f236bd13927880067750327fc17b17521031cb9fba5d8cbc3dad06185e49de60fac484944c3c12682b604e0261b5375d3bf68ac',
    },
    description: 'A swap script with an empty claim key is not a swap script',
    expected: false,
  },
  {
    args: {
      script: '8201208763a914c792bea2f08a4dcada80a2e848e01f236bd139278821039a52e5049486097409dc92b476a0c72fcc24021d2c7d3bbf91789745041a488a67750327fc17b1750068ac',
    },
    description: 'A swap script with an empty refund key is not a swap script',
    expected: false,
  },
  {
    args: {
      script: '21039a52e5049486097409dc92b476a0c72fcc24021d2c7d3bbf91789745041a488aac6476a914382f1ac022fce4ff91259403111a6ebaf1e4831a88ad0327fc17b16782012088a914c792bea2f08a4dcada80a2e848e01f236bd139278851b268',
    },
    description: 'A v2 swap script is not a v1 swap script',
    expected: false,
  },
];

tests.forEach(({args, description, error, expected}) => {
  return test(description, (t, end) => {
    if (!!error) {
      throws(() => isSwapScriptV1(args), new Error(error), 'Got error');
    } else {
      const is = isSwapScriptV1(args);

      equal(is, expected, 'Got expected version');
    }

    return end();
  });
});

const {equal} = require('node:assert').strict;
const test = require('node:test');

const {p2shOutputScript} = require('./../../script');

const tests = [
  {
    args: {
      script: '2200206f569f1dcbb18b78883398b66a52c7c50938119ed4567cc3c2e5bb6d7b36c650',
    },
    description: 'P2SH output script derived for redeem script',
    expected: {
      output: 'a914f72fdebe5fb2f9b9619cf8ec8d328372ecbd54c787',
    },
  },
];

tests.forEach(({args, description, expected}) => {
  return test(description, (t, end) => {
    const {output} = p2shOutputScript(args);

    equal(output, expected.output, 'Output script as expected');

    return end();
  });
});

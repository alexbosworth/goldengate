const {equal} = require('node:assert').strict;
const test = require('node:test');
const {throws} = require('node:assert').strict;

const {versionOfSwapScript} = require('./../../script');

const tests = [
  {
    args: {},
    description: 'A script is expected',
    error: 'ExpectedScriptToDetermineSwapScriptVersion'
  },
  {
    args: {
      script: '21034ee0ae3699f1b423286a8e19396365e1246c5b161f36924366189369c5027943ac6476a914a6c608cb65b77279465241c90d8a476cc065c0d188ad02c800b16782012088a914b0b56f62f01c2bf02d954b258d566106078cc33e8851b268',
    },
    description: 'Version of script is returned.',
    expected: {version: 2},
  },
];

tests.forEach(({args, description, error, expected}) => {
  return test(description, (t, end) => {
    if (!!error) {
      throws(() => versionOfSwapScript(args), new Error(error), 'Got error');
    } else {
      const {version} = versionOfSwapScript(args);

      equal(version, expected.version, 'Got expected version');
    }

    return end();
  });
});

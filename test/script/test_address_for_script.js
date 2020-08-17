const {test} = require('tap');

const {addressForScript} = require('./../../');

const tests = [
  {
    args: {
      network: 'btctestnet',
      script: '8201208763a9141cdc61141d0bee6afec8bf7fd7bb85c62bed15828821030b2a7982090497f5da5aff78e8fd001aa110992349152077b5694628fadbe7cb6775038c2017b1752103d0d76db25e6b64bdcdaa838d771375b7a26967ab896570a05aa4dd1ed189b34068ac',
    },
    description: 'Derive address from swap script.',
    expected: 'tb1qzmswhxxwxvhat6ke3wu27gqqxn4qxqn6qwarwkz6lmky3l3jqjfqy5wl9x',
  },
  {
    args: {},
    description: 'A network name is required to derive address',
    error: 'ExpectedNetworkNameToDeriveAddress',
  },
  {
    args: {network: 'unknown'},
    description: 'A known network is required to derive address',
    error: 'ExpectedKnownNetworkToDeriveAddress',
  },
  {
    args: {network: 'btctestnet'},
    description: 'An output script is required to derive address',
    error: 'ExpectedWitnessScriptToDeriveAddress',
  },
];

tests.forEach(({args, description, error, expected}) => {
  return test(description, ({equal, end, throws}) => {
    if (!!error) {
      throws(() => addressForScript(args), new Error(error), 'Error returned');

      return end();
    }

    const {address} = addressForScript(args);

    equal(address, expected, 'Address derived');

    return end();
  });
});

const {test} = require('@alexbosworth/tap');

const method = require('./../../funding/bech32_address_as_script');

const tests = [
  {
    args: {
      address: 'tb1qzmswhxxwxvhat6ke3wu27gqqxn4qxqn6qwarwkz6lmky3l3jqjfqy5wl9x',
    },
    description: 'Derive output script for address.',
    expected: {
      script: '002016e0eb98ce332fd5ead98bb8af200034ea03027a03ba37585afeec48fe320492',
    },
  },
  {
    args: {
      address: 'tb1pqqqqp399et2xygdj5xreqhjjvcmzhxw4aywxecjdzew6hylgvsesf3hn0c',
    },
    description: 'Derive output script for v1 address.',
    expected: {
      script: '5120000000c4a5cad46221b2a187905e5266362b99d5e91c6ce24d165dab93e86433',
    },
  },
];

tests.forEach(({args, description, error, expected}) => {
  return test(description, ({end, strictSame, throws}) => {
    if (!!error) {
      throws(() => method(args), new Error(error), 'Error returned');

      return end();
    } else {
      const got = method(args);

      strictSame(got, expected, 'Got expected result');
    }

    return end();
  });
});

const {test} = require('@alexbosworth/tap');

const dir = './../../script';

const makeAddressForScript = require(`${dir}/make_address_for_script`);

const tests = [
  {
    args: {},
    description: 'A network name is required to derive address',
    error: [
      400,
      'FailedToDeriveSwapScript',
      {err: new Error('ExpectedNetworkNameToDeriveAddress')},
    ],
  },
];

tests.forEach(({args, description, error, expected}) => {
  return test(description, ({equal, end, rejects}) => {
    rejects(() => makeAddressForScript(args), error, 'Error returned');

    return end();
  });
});

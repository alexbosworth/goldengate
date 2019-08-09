const {test} = require('tap');

const {serviceSocket} = require('./../../lightninglabs');

const tests = [
  {
    args: {network: 'btc'},
    description: 'Get service socket',
    expected: {socket: 'swap.lightning.today:11009'},
  },
  {
    args: {},
    description: 'Service socket requires network',
    error: 'ExpectedNetworkNameForSwapServiceSocket',
  },
  {
    args: {network: 'unknown'},
    description: 'Service socket requires known network',
    error: 'ExpectedKnownNetworkForServiceSocket',
  },
];

tests.forEach(({args, description, error, expected}) => {
  return test(description, ({equal, end, throws}) => {
    if (!!error) {
      throws(() => serviceSocket(args), new Error(error), 'Got error');

      return end();
    }

    const {socket} = serviceSocket(args);

    equal(socket, expected.socket, 'Received swap socket');

    return end();
  });
});

const {equal} = require('node:assert').strict;
const test = require('node:test');
const {throws} = require('node:assert').strict;

const {serviceSocket} = require('./../../lightninglabs');

const tests = [
  {
    args: {is_free: true, network: 'btc'},
    description: 'Get service socket for free endpoint',
    expected: {socket: 'swap.lightning.today:11009'},
  },
  {
    args: {network: 'btc'},
    description: 'Get service socket for paid endpoint',
    expected: {socket: 'swap.lightning.today:11010'},
  },
  {
    args: {network: 'btcsignet'},
    description: 'Get service socket for signet',
    expected: {socket: 'signet.swap.lightning.today:11010'},
  },
  {
    args: {is_free: true, network: 'btcsignet'},
    description: 'There is no free service socket for signet',
    error: 'ExpectedKnownNetworkForServiceSocket',
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
  {
    args: {is_free: true, network: 'unknown'},
    description: 'Free service socket requires known network',
    error: 'ExpectedKnownNetworkForServiceSocket',
  },
];

tests.forEach(({args, description, error, expected}) => {
  return test(description, (t, end) => {
    if (!!error) {
      throws(() => serviceSocket(args), new Error(error), 'Got error');
    } else {
      const {socket} = serviceSocket(args);

      equal(socket, expected.socket, 'Received swap socket');
    }

    return end();
  });
});

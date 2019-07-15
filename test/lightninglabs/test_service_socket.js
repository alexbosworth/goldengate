const {test} = require('tap');

const {serviceSocket} = require('./../../lightninglabs');

const tests = [
  {
    args: {network: 'btc'},
    description: 'Get service socket',
    expected: {socket: 'swap.lightning.today:11009'},
  },
];

tests.forEach(({args, description, expected}) => {
  return test(description, ({equal, end}) => {
    const {socket} = serviceSocket(args);

    equal(socket, expected.socket, 'Received swap socket');

    return end();
  });
});

const {equal} = require('node:assert').strict;
const test = require('node:test');
const {throws} = require('node:assert').strict;

const {getGrpcInterface} = require('./../../');

const tests = [
  {
    args: {socket: 'socket'},
    description: 'Get grpc interface',
    expected: {},
  },
  {
    args: {},
    description: 'No socket throws error',
    error: 'ExpectedGrpcIpOrDomainWithPortString',
  },
];

tests.forEach(({args, description, error, expected}) => {
  return test(description, (t, end) => {
    if (!!error) {
      throws(() => getGrpcInterface(args), new Error(error), 'Fails with err');
    } else {
      const {grpc} = getGrpcInterface(args);

      equal(typeof grpc.newLoopOutSwap, 'function', 'Has new loop out method');
      equal(typeof grpc.loopOutQuote, 'function', 'Has loop out quote method');
      equal(typeof grpc.newLoopInSwap, 'function', 'Has loop in method');
      equal(typeof grpc.loopInQuote, 'function', 'Has loop in quote method');
    }

    return end();
  });
});

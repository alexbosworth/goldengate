const {test} = require('@alexbosworth/tap');

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
  return test(description, ({equal, end, throws, type}) => {
    if (!!error) {
      throws(() => getGrpcInterface(args), new Error(error), 'Fails with err');

      return end();
    }

    const {grpc} = getGrpcInterface(args);

    type(grpc.newLoopOutSwap, Function, 'Has new loop out swap method');
    type(grpc.loopOutQuote, Function, 'Has loop out quote method');
    type(grpc.newLoopInSwap, Function, 'Has loop in method');
    type(grpc.loopInQuote, Function, 'Has loop in quote method');

    return end();
  });
});

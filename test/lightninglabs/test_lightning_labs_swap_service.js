const {test} = require('tap');

const {lightningLabsSwapService} = require('./../../lightninglabs');

const tests = [
  {
    args: {network: 'btc'},
    description: 'Get grpc service',
    expected: {
      methods: [
        'loopInQuote',
        'loopOutQuote',
        'newLoopInSwap',
        'newLoopOutSwap',
      ],
    },
  },
];

tests.forEach(({args, description, expected}) => {
  return test(description, ({end, type}) => {
    const {service} = lightningLabsSwapService(args);

    expected.methods.forEach(method => {
      return type(service[method], Function, 'Has method');
    });

    return end();
  });
});

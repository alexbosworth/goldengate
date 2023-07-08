const {equal} = require('node:assert').strict;
const test = require('node:test');

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
  return test(description, (t, end) => {
    const {service} = lightningLabsSwapService(args);

    expected.methods.forEach(method => {
      return equal(typeof service[method], 'function', 'Has method');
    });

    return end();
  });
});

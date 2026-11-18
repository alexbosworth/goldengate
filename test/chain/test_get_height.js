const {equal} = require('node:assert').strict;
const {rejects} = require('node:assert').strict;
const test = require('node:test');

const {makeLnd} = require('mock-lnd');

const {getHeight} = require('./../../');

const tests = [
  {
    args: {},
    description: 'LND or request is required',
    error: [400, 'ExpectedLndOrRequestToGetChainHeight'],
  },
  {
    args: {request: ({}) => {}},
    description: 'Network is required when request is specified',
    error: [400, 'ExpectedNetworkWhenUsingRequestToGetChainHeight'],
  },
  {
    args: {
      network: 'btctestnet',
      request: ({url}, cbk) => {
        switch (url) {
          case 'https://blockstream.info/testnet/api/blocks/tip/height':
            return cbk(null, {statusCode: 200}, '100');

          default:
            return cbk(new Error('UnexpedtedUrlWhenTestingGetChainTipHeight'));
        }
      },
    },
    description: 'Get chain height',
    expected: {height: 100},
  },
  {
    args: {lnd: makeLnd({chain: {height: 800000}})},
    description: 'Get chain height via lnd',
    expected: {height: 800000},
  },
];

tests.forEach(({args, description, error, expected}) => {
  return test(description, async () => {
    if (!!error) {
      await rejects(getHeight(args), error, 'Got expected error');
    } else {
      const {height} = await getHeight(args);

      equal(height, expected.height, 'Got chain height');
    }

    return;
  });
});

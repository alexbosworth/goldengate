const {test} = require('@alexbosworth/tap');

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
    args: {
      lnd: {
        default: {
          getInfo: ({}, cbk) => cbk(null, {
            alias: '',
            best_header_timestamp: 1,
            block_hash: '00',
            block_height: 1,
            chains: [{chain: 'bitcoin', network: 'mainnet'}],
            color: '#000000',
            features: {"1": {is_known: true, is_required: false}},
            identity_pubkey: '020000000000000000000000000000000000000000000000000000000000000000',
            num_active_channels: 0,
            num_peers: 0,
            num_pending_channels: 0,
            synced_to_chain: false,
            uris: [],
            version: '',
          }),
        },
      }
    },
    description: 'Get chain height via lnd',
    expected: {height: 1},
  },
];

tests.forEach(({args, description, error, expected}) => {
  return test(description, async ({equal, end, rejects}) => {
    if (!!error) {
      await rejects(getHeight(args), error, 'Got expected error');
    } else {
      const {height} = await getHeight(args);

      equal(height, expected.height, 'Got chain height');
    }

    return end();
  });
});

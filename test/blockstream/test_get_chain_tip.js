const {equal} = require('node:assert').strict;
const {rejects} = require('node:assert').strict;
const test = require('node:test');

const {getChainTip} = require('./../../blockstream');

const hash = Buffer.alloc(32).toString('hex');

const makeRequest = ({block, err, response}) => {
  return ({url}, cbk) => {
    switch (url) {
      case 'https://blockstream.info/testnet/api/blocks/tip/hash':
        return cbk(null, {statusCode: 200}, hash);

      case `https://blockstream.info/testnet/api/block/${hash}`:
        return cbk(err, response, block);

      default:
        return cbk(new Error('UnexpectedUrlWhenTestingGetChainTip'));
    }
  };
};

const tests = [
  {
    args: {request: ({}, cbk) => cbk()},
    description: 'A network name is required',
    error: [400, 'ExpectedNetworkToGetChainTip'],
  },
  {
    args: {network: 'btctestnet'},
    description: 'A request function is required',
    error: [400, 'ExpectedRequestToGetChainTip'],
  },
  {
    args: {network: 'btctestnet', request: ({}, cbk) => cbk('err')},
    description: 'Service errors are passed back',
    error: [503, 'UnexpectedErrorGettingChainTipHash', {err: 'err'}],
  },
  {
    args: {network: 'btctestnet', request: ({}, cbk) => cbk()},
    description: 'A service response is expected',
    error: [503, 'UnexpectedResponseGettingChainTipHash'],
  },
  {
    args: {network: 'btctestnet', request: ({}, cbk) => cbk(null, {})},
    description: 'An ok status is expected',
    error: [503, 'UnexpectedStatusCodeGettingChainTipHash'],
  },
  {
    args: {network: 'btc', request: ({}, cbk) => cbk(null, {statusCode: 200})},
    description: 'A hash is expected',
    error: [503, 'ExpectedBlockHashWhenGettingChainTipHash'],
  },
  {
    args: {network: 'btctestnet', request: makeRequest({err: 'err'})},
    description: 'Block lookup errors are passed back',
    error: [503, 'UnexpectedErrorGettingTipBlockDetails', {err: 'err'}],
  },
  {
    args: {network: 'btctestnet', request: makeRequest({})},
    description: 'A block lookup response is expected',
    error: [503, 'ExpectedResponseWhenGettingChainTipBlock'],
  },
  {
    args: {network: 'btctestnet', request: makeRequest({response: {}})},
    description: 'An ok block lookup status is expected',
    error: [503, 'UnexpectedStatusCodeGettingBlockDetails'],
  },
  {
    args: {
      network: 'btctestnet',
      request: makeRequest({response: {statusCode: 200}}),
    },
    description: 'Block details are expected',
    error: [503, 'ExpectedBlockDetailsInBlockLookupResponse'],
  },
  {
    args: {
      network: 'btctestnet',
      request: makeRequest({block: {}, response: {statusCode: 200}}),
    },
    description: 'A block height is expected',
    error: [503, 'ExpectedBlockHeightInBlockLookupDetails'],
  },
  {
    args: {
      network: 'btctestnet',
      request: makeRequest({block: {height: 1}, response: {statusCode: 200}}),
    },
    description: 'Get chain tip',
    expected: {height: 1, id: hash},
  },
];

tests.forEach(({args, description, error, expected}) => {
  return test(description, async () => {
    if (!!error) {
      await rejects(getChainTip(args), error, 'Got expected error');
    } else {
      const {height, id} = await getChainTip(args);

      equal(height, expected.height, 'Got chain tip height');
      equal(id, expected.id, 'Got chain tip block id');
    }

    return;
  });
});

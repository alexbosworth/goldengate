const {test} = require('tap');

const {getHeightFromBlockstream} = require('./../../blockstream');

const makeArgs = override => {
  const args = {
    network: 'btctestnet',
    request: ({}, cbk) => cbk(null, {statusCode: 200}, '1'),
  };

  Object.keys(override).forEach(key => args[key] = override[key]);

  return args;
}

const tests = [
  {
    args: makeArgs({network: undefined}),
    description: 'A network name is required',
    error: [400, 'ExpectedKnownNetworkNameToGetChainTipHeight'],
  },
  {
    args: makeArgs({network: 'network'}),
    description: 'A known network name is required',
    error: [400, 'ExpectedKnownNetworkNameToGetChainTipHeight'],
  },
  {
    args: makeArgs({request: undefined}),
    description: 'A request method required',
    error: [400, 'ExpectedRequestFunctionToGetChainTipHeight'],
  },
  {
    args: makeArgs({request: ({}, cbk) => cbk('err')}),
    description: 'Errors from the server are passed back',
    error: [503, 'UnexpectedErrorGettingChainTipHeight', {err: 'err'}],
  },
  {
    args: makeArgs({request: ({}, cbk) => cbk()}),
    description: 'A server response is expected',
    error: [503, 'UnexpectedEmptyResponseGettingChainTipHeight'],
  },
  {
    args: makeArgs({request: ({}, cbk) => cbk(null, {})}),
    description: 'A server OK response is expected',
    error: [503, 'UnexpectedStatusCodeGettingChainTipHeight'],
  },
  {
    args: makeArgs({request: ({}, cbk) => cbk(null, {statusCode: 200})}),
    description: 'A height response is expected',
    error: [503, 'ExpectedHeightInGetChainTipHeightResponse'],
  },
  {
    args: makeArgs({request: ({}, cbk) => cbk(null, {statusCode: 200}, 'mm')}),
    description: 'A numeric height response is expected',
    error: [503, 'UnexpectedHeightValueInChainTipHeightResponse'],
  },
  {
    args: makeArgs({}),
    description: 'Get height from Blockstream',
    expected: {height: 1},
  },
];

tests.forEach(({args, description, error, expected}) => {
  return test(description, async ({equal, end, rejects}) => {
    if (!!error) {
      await rejects(getHeightFromBlockstream(args), error, 'Got error');
    } else {
      const {height} = await getHeightFromBlockstream(args);

      equal(height, expected.height, 'Got blockstream height');
    }

    return end();
  });
});

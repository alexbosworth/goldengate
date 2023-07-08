const {deepEqual} = require('node:assert').strict;
const {rejects} = require('node:assert').strict;
const test = require('node:test');

const fetch = require('@alexbosworth/node-fetch');

const {genericSwapServer} = require('./../../service');
const {genericSwapService} = require('./../../');
const {getSwapInQuote} = require('./../../');

const metadata = {get: () => [String()]};
const port = 2349;
const socket = `http://localhost:${port}`;

const tests = [
  {
    args: {
      metadata,
      service: genericSwapService({fetch, socket}).service,
      tokens: 1e6,
    },
    description: 'Generic swap service can be used to get a swap in quote',
    expected: {cltv_delta: 1000, fee: 6500},
  },
];

const startSwapServer = ({app, port}) => new Promise((resolve, reject) => {
  let server;

  server = app.listen(port, () => resolve({server}));

  return;
});

const stopSwapServer = ({server}) => new Promise((resolve, reject) => {
  return server.close(() => resolve());
});

tests.forEach(({args, description, error, expected}) => {
  return test(description, async () => {
    const {app} = genericSwapServer({});

    const {server} = await startSwapServer({app, port});

    if (!!error) {
      await rejects(getSwapInQuote(args), error, 'Got ExpectedError');
    } else {
      const result = await getSwapInQuote(args);

      deepEqual(result, expected, 'Got expected result');
    }

    await stopSwapServer({server});

    return;
  });
});

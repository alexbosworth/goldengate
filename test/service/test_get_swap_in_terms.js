const fetch = require('node-fetch');
const {test} = require('tap');

const {genericSwapServer} = require('./../../service');
const {genericSwapService} = require('./../../');
const {getSwapInTerms} = require('./../../');

const metadata = {get: () => [String()]};
const port = 2350;
const socket = `http://localhost:${port}`;

const tests = [
  {
    args: {metadata, service: genericSwapService({fetch, socket}).service},
    description: 'Generic swap service can be used to get swap in terms',
    expected: {max_tokens: 30e6, min_tokens: 250000},
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
  return test(description, async ({deepIs, end, equal, throws, rejects}) => {
    const {app} = genericSwapServer({});

    const {server} = await startSwapServer({app, port});

    if (!!error) {
      await rejects(getSwapInTerms(args), error, 'Got ExpectedError');
    } else {
      const result = await getSwapInTerms(args);

      deepIs(result, expected, 'Got expected result');
    }

    await stopSwapServer({server});

    return end();
  });
});

const fetch = require('@alexbosworth/node-fetch');
const {test} = require('@alexbosworth/tap');

const {genericSwapServer} = require('./../../service');
const {genericSwapService} = require('./../../');
const {getSwapOutQuote} = require('./../../');

const metadata = {get: () => [String()]};
const port = 2351;
const socket = `http://localhost:${port}`;

const tests = [
  {
    args: {
      metadata,
      service: genericSwapService({fetch, socket}).service,
      timeout: 100,
      tokens: 250000,
    },
    description: 'Generic swap service can be used to get swap out quotes',
    expected: {
      deposit: 30000,
      destination: '000000000000000000000000000000000000000000000000000000000000000000',
      fee: 625,
    },
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
  return test(description, async ({end, rejects, strictSame}) => {
    const {app} = genericSwapServer({
      destination: Buffer.alloc(33).toString('hex'),
    });

    const {server} = await startSwapServer({app, port});

    if (!!error) {
      await rejects(getSwapOutQuote(args), error, 'Got ExpectedError');
    } else {
      const result = await getSwapOutQuote(args);

      strictSame(result, expected, 'Got expected result');
    }

    await stopSwapServer({server});

    return end();
  });
});

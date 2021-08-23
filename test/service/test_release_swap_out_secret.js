const fetch = require('node-fetch');
const {test} = require('@alexbosworth/tap');

const {genericSwapServer} = require('./../../service');
const {genericSwapService} = require('./../../');
const {releaseSwapOutSecret} = require('./../../');

const metadata = {get: () => [String()]};
const port = 2353;
const socket = `http://localhost:${port}`;

const tests = [
  {
    args: {
      metadata,
      auth_macaroon: Buffer.alloc(1).toString('base64'),
      auth_preimage: Buffer.alloc(32).toString('hex'),
      secret: Buffer.alloc(32).toString('hex'),
      service: genericSwapService({fetch, socket}).service,
    },
    description: 'Generic swap service can be used to release a swap secret',
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
    const {app} = genericSwapServer({});

    const {server} = await startSwapServer({app, port});

    if (!!error) {
      await rejects(releaseSwapOutSecret(args), error, 'Got ExpectedError');
    } else {
      const result = await releaseSwapOutSecret(args);

      strictSame(result, expected, 'Got expected result');
    }

    await stopSwapServer({server});

    return end();
  });
});

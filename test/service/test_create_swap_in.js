const fetch = require('node-fetch');
const {test} = require('tap');

const {genericSwapServer} = require('./../../service');
const {genericSwapService} = require('./../../');
const {createSwapIn} = require('./../../');

const port = 2348;

const metadata = {get: () => [String()]};
const socket = `http://localhost:${port}`;

const tests = [
  {
    args: {
      metadata,
      fee: 1000,
      max_timeout_height: 1000,
      private_key: Buffer.alloc(32, 1).toString('hex'),
      request: 'lnbc2500u1pvjluezpp5qqqsyqcyq5rqwzqfqqqsyqcyq5rqwzqfqqqsyqcyq5rqwzqfqypqdq5xysxxatsyp3k7enxv4jsxqzpuaztrnwngzn3kdzw5hydlzf03qdgm2hdq27cqv3agm2awhz5se903vruatfhq77w3ls4evs3ch9zw97j25emudupq63nyw24cg27h2rspfj9srp',
      service: genericSwapService({fetch, socket}).service,
    },
    description: 'Generic swap service can be used to create a swap in',
    expected: {
      script: '21000000000000000000000000000000000000000000000000000000000000000000ac6476a91479b000887626b294a914501a4cd226b58b23598388ad02e803b16782012088a9149295a60ff5be100c30c342ba11556fd3ed7225878851b268',
      address: 'bc1qv6ayyjt0a9rme9khys7p7fkruhwcfyhdcr9hv5u6630gp2chuqcsrnhz4x',
      id: '0001020304050607080900010203040506070809000102030405060708090102',
      nested_address: '38ijt7FBmDByCS3SRwg89XDJkc9tuMknQR',
      private_key: '0101010101010101010101010101010101010101010101010101010101010101',
      service_message: 'message',
      service_public_key: '000000000000000000000000000000000000000000000000000000000000000000',
      timeout: 1000,
      tokens: 251000,
      version: 2,
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
  return test(description, async ({deepIs, end, equal, throws, rejects}) => {
    const {app} = genericSwapServer({
      handle_swap_in: ({}) => new Promise((resolve, reject) => {
        return resolve({
          expiry: 1000,
          receiver_key: Buffer.alloc(33).toString('base64'),
          server_message: 'message',
        });
      }),
    });

    const {server} = await startSwapServer({app, port});

    if (!!error) {
      await rejects(createSwapIn(args), error, 'Got ExpectedError');
    } else {
      const result = await createSwapIn(args);

      deepIs(result, expected, 'Got expected result');
    }

    await stopSwapServer({server});

    return end();
  });
});

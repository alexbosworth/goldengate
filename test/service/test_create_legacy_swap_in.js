const {deepEqual} = require('node:assert').strict;
const {rejects} = require('node:assert').strict;
const test = require('node:test');

const {createLegacySwapIn} = require('./../../');
const {genericSwapServer} = require('./../macros');
const {genericSwapService} = require('./../../');

const port = 2348;

const address = 'bc1qv6ayyjt0a9rme9khys7p7fkruhwcfyhdcr9hv5u6630gp2chuqcsrnhz4x';
const id = '0001020304050607080900010203040506070809000102030405060708090102';
const metadata = {get: () => [String()]};
const nestedAddress = '38ijt7FBmDByCS3SRwg89XDJkc9tuMknQR';
const privateKey = Buffer.alloc(32, 1).toString('hex');
const request = 'lnbc2500u1pvjluezpp5qqqsyqcyq5rqwzqfqqqsyqcyq5rqwzqfqqqsyqcyq5rqwzqfqypqdq5xysxxatsyp3k7enxv4jsxqzpuaztrnwngzn3kdzw5hydlzf03qdgm2hdq27cqv3agm2awhz5se903vruatfhq77w3ls4evs3ch9zw97j25emudupq63nyw24cg27h2rspfj9srp';
const script = '21000000000000000000000000000000000000000000000000000000000000000000ac6476a91479b000887626b294a914501a4cd226b58b23598388ad02e803b16782012088a9149295a60ff5be100c30c342ba11556fd3ed7225878851b268';
const serviceKey = Buffer.alloc(33).toString('hex');
const socket = `http://localhost:${port}`;

// The swap server makes swaps in with a placeholder service key
const {app} = genericSwapServer({
  handle_swap_in: ({}) => new Promise((resolve, reject) => {
    return resolve({
      expiry: 1000,
      receiver_key: Buffer.alloc(33).toString('base64'),
      server_message: 'message',
    });
  }),
});

const tests = [
  {
    args: {
      metadata,
      request,
      fee: 1000,
      max_timeout_height: 1000,
      private_key: privateKey,
      service: genericSwapService({fetch, socket}).service,
    },
    description: 'Generic swap service can be used to create a swap in',
    expected: {
      address,
      id,
      script,
      nested_address: nestedAddress,
      private_key: privateKey,
      service_message: 'message',
      service_public_key: serviceKey,
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

// Create a swap in while the swap server is listening
const createWithServer = async args => {
  const {server} = await startSwapServer({app, port});

  try {
    return await createLegacySwapIn(args);
  } finally {
    await stopSwapServer({server});
  }
};

tests.forEach(({args, description, error, expected}) => {
  return test(description, async () => {
    if (!!error) {
      await rejects(createWithServer(args), error, 'Got expected error');
    } else {
      deepEqual(await createWithServer(args), expected, 'Got expected swap');
    }

    return;
  });
});

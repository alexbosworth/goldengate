const fetch = require('node-fetch');
const {test} = require('tap');

const {genericSwapServer} = require('./../../service');
const {genericSwapService} = require('./../../');
const {createSwapOut} = require('./../../');

const port = 2347;

const socket = `http://localhost:${port}`;

const tests = [
  {
    args: {
      network: 'btc',
      private_key: Buffer.alloc(32, 2).toString('hex'),
      secret: Buffer.alloc(32, 2).toString('hex'),
      service: genericSwapService({fetch, socket}).service,
      timeout: 100,
      tokens: 250e3,
    },
    description: 'Generic swap service can be used to create a swap out',
    expected: {
      address: 'bc1qy7nt4vv2cn3pu8sa88au7w8zuu8qj3vpze2gt9xd6u057rfslwtqq9vaf7',
      script: '21024d4b6cd1361032ca9bd2aeb9d900aa4d45d9ead80ac9423374c451a7254d0766ac6476a91429cfc6376255a78451eeb4b129ed8eacffa2feef88ad0164b16782012088a914b43e1b38138a41b37f7cd9a1d274bc63e3a9b5d18851b268',
      private_key: '0202020202020202020202020202020202020202020202020202020202020202',
      protocol_version: 'HTLC_V2',
      secret: '0202020202020202020202020202020202020202020202020202020202020202',
      service_message: undefined,
      service_public_key: '000000000000000000000000000000000000000000000000000000000000000000',
      swap_execute_request: 'lnbc2500u1pvjluezpp5qqqsyqcyq5rqwzqfqqqsyqcyq5rqwzqfqqqsyqcyq5rqwzqfqypqdq5xysxxatsyp3k7enxv4jsxqzpuaztrnwngzn3kdzw5hydlzf03qdgm2hdq27cqv3agm2awhz5se903vruatfhq77w3ls4evs3ch9zw97j25emudupq63nyw24cg27h2rspfj9srp',
      swap_fund_request: 'lnbc2500u1pvjluezpp5qqqsyqcyq5rqwzqfqqqsyqcyq5rqwzqfqqqsyqcyq5rqwzqfqypqdq5xysxxatsyp3k7enxv4jsxqzpuaztrnwngzn3kdzw5hydlzf03qdgm2hdq27cqv3agm2awhz5se903vruatfhq77w3ls4evs3ch9zw97j25emudupq63nyw24cg27h2rspfj9srp',
      timeout: 100,
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
      handle_swap_out: ({}) => new Promise((resolve, reject) => {
        return resolve({
          prepay_invoice: 'lnbc2500u1pvjluezpp5qqqsyqcyq5rqwzqfqqqsyqcyq5rqwzqfqqqsyqcyq5rqwzqfqypqdq5xysxxatsyp3k7enxv4jsxqzpuaztrnwngzn3kdzw5hydlzf03qdgm2hdq27cqv3agm2awhz5se903vruatfhq77w3ls4evs3ch9zw97j25emudupq63nyw24cg27h2rspfj9srp',
          sender_key: Buffer.alloc(33).toString('base64'),
          service_message: 'service_message',
          swap_invoice: 'lnbc2500u1pvjluezpp5qqqsyqcyq5rqwzqfqqqsyqcyq5rqwzqfqqqsyqcyq5rqwzqfqypqdq5xysxxatsyp3k7enxv4jsxqzpuaztrnwngzn3kdzw5hydlzf03qdgm2hdq27cqv3agm2awhz5se903vruatfhq77w3ls4evs3ch9zw97j25emudupq63nyw24cg27h2rspfj9srp',
        });
      }),
    });

    const {server} = await startSwapServer({app, port});

    if (!!error) {
      await rejects(createSwapOut(args), error, 'Got ExpectedError');
    } else {
      const result = await createSwapOut(args);

      deepIs(result, expected, 'Got expected result');
    }

    await stopSwapServer({server});

    return end();
  });
});

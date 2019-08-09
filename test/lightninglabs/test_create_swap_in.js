const {ECPair} = require('bitcoinjs-lib');
const {test} = require('tap');

const {createSwapIn} = require('./../../');

const expiry = 150;
const serviceKey = ECPair.makeRandom().publicKey.toString('hex');

const tests = [
  {
    args: {
      base_fee: 2,
      fee_rate: 10000,
      request: 'lntb1500n1pwne5trpp5dgen963wrgm3y2ls8r0qv0guwgz6jjepn6w83803hlu2yp54r2fsdqvg9jxgg8zn2sscqzpgxqr23s02xlzwwanxyun29cgggcytlepmu352v2njq6cuvhl6uz6wlv7jzx8pxgvlf0983n43g243uxgv6ejt58ps035lerdulymarz9j98nqqp8340y4',
      service: {
        newLoopInSwap: ({}, cbk) => {
          return cbk(null, {
            expiry: 200,
            receiver_key: Buffer.from(serviceKey, 'hex'),
          });
        },
      },
    },
    description: 'Create a swap in',
    expected: {
      id: '6a3332ea2e1a37122bf038de063d1c7205a94b219e9c789df1bff8a206951a93',
      timeout: 200,
      tokens: 153,
    },
  },
  {
    args: {},
    description: 'Swap in requires base fee',
    error: [400, 'ExpectedBaseFeeToCreateSwapIn'],
  },
];

tests.forEach(({args, description, error, expected}) => {
  return test(description, async ({equal, end, rejects}) => {
    if (!!error) {
      rejects(createSwapIn(args), error, 'Got expected error');

      return end();
    }

    const res = await createSwapIn(args);

    equal(!!res.address, true, 'Address returned');
    equal(res.id, expected.id, 'Id returned');
    equal(!!res.script, true, 'Script returned');
    equal(!!res.private_key, true, 'Private key created');
    equal(res.timeout, expected.timeout, 'Swap timeout height');
    equal(res.tokens, expected.tokens, 'Swap tokens returned');

    return end();
  });
});

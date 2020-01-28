const {ECPair} = require('bitcoinjs-lib');
const {test} = require('tap');

const {createSwapIn} = require('./../../');

const expiry = 150;
const request = 'lntb1500n1pwne5trpp5dgen963wrgm3y2ls8r0qv0guwgz6jjepn6w83803hlu2yp54r2fsdqvg9jxgg8zn2sscqzpgxqr23s02xlzwwanxyun29cgggcytlepmu352v2njq6cuvhl6uz6wlv7jzx8pxgvlf0983n43g243uxgv6ejt58ps035lerdulymarz9j98nqqp8340y4';
const serviceKey = ECPair.makeRandom().publicKey.toString('hex');

const makeService = ({err, res}) => {
  const goodRes = {expiry: 200, receiver_key: Buffer.from(serviceKey, 'hex')};

  const result = res === undefined ? goodRes : res;

  return {
    newLoopInSwap: ({}, {}, cbk) => cbk(err || null, result),
  };
};

const tests = [
  {
    args: {},
    description: 'Expected fee to create swap in',
    error: [400, 'ExpectedFeeToCreateSwapIn'],
  },
  {
    args: {fee: 1},
    description: 'Expected payment request to create swap in',
    error: [400, 'ExpectedPaymentRequestToCreateSwapIn'],
  },
  {
    args: {request, fee: 1},
    description: 'Expected service to create swap in',
    error: [400, 'ExpectedServiceToCreateSwapIn'],
  },
  {
    args: {request, fee: 1, service: makeService({err: 'err'})},
    description: 'Error creating swap passed back',
    error: [503, 'UnexpectedErrorCreatingSwapIn', {err: 'err'}],
  },
  {
    args: {request, fee: 1, service: makeService({res: null})},
    description: 'A response is expected',
    error: [503, 'ExpectedResponseWhenCreatingSwapIn'],
  },
  {
    args: {request, fee: 1, service: makeService({res: {}})},
    description: 'A response with expiry expected',
    error: [503, 'ExpectedExpiryHeightForCreatedSwapIn'],
  },
  {
    args: {
      request,
      fee: 1,
      max_timeout_height: 1,
      service: makeService({res: {expiry: 2}}),
    },
    description: 'A response with low expiry expected',
    error: [503, 'ExpectedLowerExpiryHeightForCreatedSwapIn'],
  },
  {
    args: {request, fee: 1, service: makeService({res: {expiry: 2}})},
    description: 'A receiver key is expected',
    error: [503, 'ExpectedReceiverKeyWhenCreatingSwapIn'],
  },
  {
    args: {
      request,
      fee: 1,
      service: makeService({res: {expiry: 2, receiver_key: Buffer.alloc(0)}}),
    },
    description: 'A receiver key of pubkey length is expected',
    error: [503, 'ExpectedReceiverKeyWhenCreatingSwapIn'],
  },
  {
    args: {request, fee: 3, service: makeService({})},
    description: 'Create a swap in',
    expected: {
      id: '6a3332ea2e1a37122bf038de063d1c7205a94b219e9c789df1bff8a206951a93',
      timeout: 200,
      tokens: 153,
    },
  },
];

tests.forEach(({args, description, error, expected}) => {
  return test(description, async ({equal, end, rejects}) => {
    if (!!error) {
      await rejects(createSwapIn(args), error, 'Got expected error');

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

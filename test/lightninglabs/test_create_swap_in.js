const {ECPair} = require('bitcoinjs-lib');
const {test} = require('tap');

const {createSwapIn} = require('./../../');

const expiry = 150;
const request = 'lntb1500n1pwne5trpp5dgen963wrgm3y2ls8r0qv0guwgz6jjepn6w83803hlu2yp54r2fsdqvg9jxgg8zn2sscqzpgxqr23s02xlzwwanxyun29cgggcytlepmu352v2njq6cuvhl6uz6wlv7jzx8pxgvlf0983n43g243uxgv6ejt58ps035lerdulymarz9j98nqqp8340y4';
const serviceKey = ECPair.makeRandom().publicKey.toString('hex');

const makeArgs = overrides => {
  const args = {
    request,
    fee: 3,
    in_through: Buffer.alloc(33).toString('hex'),
    metadata: {},
    service: makeService({}),
  };

  Object.keys(overrides).forEach(k => args[k] = overrides[k]);

  return args;
};

const makeService = ({err, res}) => {
  const goodRes = {expiry: 200, receiver_key: Buffer.from(serviceKey, 'hex')};

  const result = res === undefined ? goodRes : res;

  return {
    newLoopInSwap: ({}, {}, cbk) => cbk(err || null, result),
  };
};

const tests = [
  {
    args: makeArgs({fee: undefined}),
    description: 'Expected fee to create swap in',
    error: [400, 'ExpectedFeeToCreateSwapIn'],
  },
  {
    args: makeArgs({metadata: undefined}),
    description: 'Expected metadata to create swap in',
    error: [400, 'ExpectedAuthenticationMetadataToCreateSwapIn'],
  },
  {
    args: makeArgs({request: undefined}),
    description: 'Expected payment request to create swap in',
    error: [400, 'ExpectedPaymentRequestToCreateSwapIn'],
  },
  {
    args: makeArgs({
      request: 'lnxx1500n1pwne5trpp5dgen963wrgm3y2ls8r0qv0guwgz6jjepn6w83803hlu2yp54r2fsdqvg9jxgg8zn2sscqzpgxqr23s02xlzwwanxyun29cgggcytlepmu352v2njq6cuvhl6uz6wlv7jzx8pxgvlf0983n43g243uxgv6ejt58ps035lerdulymarz9j98nqqp8340y4',
    }),
    description: 'Expected valid payment request to create swap in',
    error: [400, 'ExpectedValidPayReqToCreateSwapIn'],
  },
  {
    args: makeArgs({
      request: 'lnltc4200n1p0nmawspp5x6su30qwu02ltde8tjyff3snlrkv8ns6hg5g7sxj8flzz4ue7jsqdp6f45kcmrfdahzqnrfw3jkxmmfdcsysmmdv4cxzem9yp8hyer9wgszxd3hxvcqzjqxqzfvua2paum05jcda70kvm4d7j066spu07fdwmx2zxdmpcx8esykq9hpm337xyxcdvtzsmwnkhm9rvh9fxm5z9lfdkq3kl2erpgr6qhpfuspx4p8e6',
    }),
    description: 'Expected supported network to create swap in',
    error: [400, 'ExpectedKnownNetworkForSwapInPaymentRequest'],
  },
  {
    args: makeArgs({service: undefined}),
    description: 'Expected service to create swap in',
    error: [400, 'ExpectedServiceToCreateSwapIn'],
  },
  {
    args: makeArgs({service: makeService({err: 'err'})}),
    description: 'Error creating swap passed back',
    error: [503, 'UnexpectedErrorCreatingSwapIn', {err: 'err'}],
  },
  {
    args: {
      request,
      fee: 1,
      metadata: {},
      service: makeService({err: {details: 'contract already exists'}}),
    },
    description: 'Error creating an already existing swap passed back',
    error: [400, 'SwapInAlreadyPreviouslyCreatedForThisHash'],
  },
  {
    args: {request, metadata: {}, fee: 1, service: makeService({res: null})},
    description: 'A response is expected',
    error: [503, 'ExpectedResponseWhenCreatingSwapIn'],
  },
  {
    args: {request, metadata: {}, fee: 1, service: makeService({res: {}})},
    description: 'A response with expiry expected',
    error: [503, 'ExpectedExpiryHeightForCreatedSwapIn'],
  },
  {
    args: {
      request,
      fee: 1,
      max_timeout_height: 1,
      metadata: {},
      service: makeService({res: {expiry: 2}}),
    },
    description: 'A response with low expiry expected',
    error: [503, 'ExpectedLowerExpiryHeightForCreatedSwapIn'],
  },
  {
    args: {
      request,
      metadata: {},
      fee: 1,
      service: makeService({res: {expiry: 2}}),
    },
    description: 'A receiver key is expected',
    error: [503, 'ExpectedReceiverKeyWhenCreatingSwapIn'],
  },
  {
    args: {
      request,
      fee: 1,
      metadata: {},
      service: makeService({res: {expiry: 2, receiver_key: Buffer.alloc(0)}}),
    },
    description: 'A receiver key of pubkey length is expected',
    error: [503, 'ExpectedReceiverPublicKeyWhenCreatingSwapIn'],
  },
  {
    args: {
      request,
      fee: 1,
      metadata: {},
      service: makeService({
        res: {expiry: Infinity, receiver_key: Buffer.alloc(33)},
      }),
    },
    description: 'A valid expiry height expected',
    error: [500, 'FailedToDeriveSwapScriptWhenCreatingSwap'],
  },
  {
    args: makeArgs({}),
    description: 'Create a swap in',
    expected: {
      id: '6a3332ea2e1a37122bf038de063d1c7205a94b219e9c789df1bff8a206951a93',
      private_key: true,
      script: '21034ee0ae3699f1b423286a8e19396365e1246c5b161f36924366189369c5027943ac6476a914a6c608cb65b77279465241c90d8a476cc065c0d188ad02c800b16782012088a914b0b56f62f01c2bf02d954b258d566106078cc33e8851b268',
      timeout: 200,
      tokens: 153,
      version: 2,
    },
  },
  {
    args: {
      request,
      fee: 3,
      in_through: Buffer.alloc(33).toString('hex'),
      metadata: {},
      public_key: Buffer.alloc(33).toString('hex'),
      service: makeService({}),
    },
    description: 'Create a swap in and specify a public key',
    expected: {
      id: '6a3332ea2e1a37122bf038de063d1c7205a94b219e9c789df1bff8a206951a93',
      private_key: false,
      script: '21034ee0ae3699f1b423286a8e19396365e1246c5b161f36924366189369c5027943ac6476a914a6c608cb65b77279465241c90d8a476cc065c0d188ad02c800b16782012088a914b0b56f62f01c2bf02d954b258d566106078cc33e8851b268',
      timeout: 200,
      tokens: 153,
      version: 2,
    },
  },
];

tests.forEach(({args, description, error, expected}) => {
  return test(description, async ({equal, end, rejects}) => {
    if (!!error) {
      await rejects(createSwapIn(args), error, 'Got expected error');
    } else {
      const res = await createSwapIn(args);

      equal(!!res.address, true, 'Address returned');
      equal(res.id, expected.id, 'Id returned');
      equal(!!res.nested_address, true, 'Nested address returned');
      equal(!!res.script, true, 'Script returned');
      equal(!!res.private_key, expected.private_key, 'Private key creation');
      equal(res.timeout, expected.timeout, 'Swap timeout height');
      equal(res.tokens, expected.tokens, 'Swap tokens returned');
      equal(res.version, expected.version, 'Swap version returned');
    }

    return end();
  });
});

const {equal} = require('node:assert').strict;
const {rejects} = require('node:assert').strict;
const test = require('node:test');

const {addressForScript} = require('./../../');
const {createSwapIn} = require('./../../');
const {swapScriptV2} = require('./../../');

const expiry = 150;
const regtestRequest = 'lnbcrt1500n1p54twgqpp5dgen963wrgm3y2ls8r0qv0guwgz6jjepn6w83803hlu2yp54r2fs9qqxqyz5vqdqvwdmkzupqd9hqnp4qvdcf32k0vfxgsyet5ldt246q4jaw8scx3sysx0lnstlt6w4m5rc7cqzpgej0fj4g50uq9u09qk7zrlz3m9rxa2c43tty7042fxrxvjjw29sp92kkvgec6kl4wxhehu7r4ush9uk2zmwk43v2knfjlmncku33j52sq0eltf7';
const request = 'lntb1500n1pwne5trpp5dgen963wrgm3y2ls8r0qv0guwgz6jjepn6w83803hlu2yp54r2fsdqvg9jxgg8zn2sscqzpgxqr23s02xlzwwanxyun29cgggcytlepmu352v2njq6cuvhl6uz6wlv7jzx8pxgvlf0983n43g243uxgv6ejt58ps035lerdulymarz9j98nqqp8340y4';
const serviceKey = Buffer.alloc(33, 3).toString('hex');

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
    args: makeArgs({private_key: Buffer.alloc(32).toString('hex')}),
    description: 'Expected valid private key to create swap in',
    error: [400, 'ExpectedValidPrivateKeyToCreateSwapIn'],
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
      network: 'btctestnet',
      private_key: true,
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
      network: 'btctestnet',
      private_key: false,
      timeout: 200,
      tokens: 153,
      version: 2,
    },
  },
  {
    args: makeArgs({request: regtestRequest}),
    description: 'Create a swap in with a regtest payment request',
    expected: {
      id: '6a3332ea2e1a37122bf038de063d1c7205a94b219e9c789df1bff8a206951a93',
      network: 'btcregtest',
      private_key: true,
      timeout: 200,
      tokens: 153,
      version: 2,
    },
  },
];

tests.forEach(({args, description, error, expected}) => {
  return test(description, async () => {
    if (!!error) {
      await rejects(createSwapIn(args), error, 'Got expected error');
    } else {
      const res = await createSwapIn(args);

      equal(res.id, expected.id, 'Id returned');
      equal(!!res.private_key, expected.private_key, 'Private key creation');
      equal(res.timeout, expected.timeout, 'Swap timeout height');
      equal(res.tokens, expected.tokens, 'Swap tokens returned');
      equal(res.version, expected.version, 'Swap version returned');

      // The swap refunds to the key that the client holds
      const {script} = swapScriptV2({
        claim_public_key: serviceKey,
        hash: expected.id,
        refund_private_key: res.private_key,
        refund_public_key: args.public_key,
        timeout: expected.timeout,
      });

      equal(res.script, script, 'Swap script refunds to the client');

      const {address, nested} = addressForScript({
        script,
        network: expected.network,
      });

      equal(res.address, address, 'Got swap address');
      equal(res.nested_address, nested, 'Got nested swap address');
    }

    return;
  });
});

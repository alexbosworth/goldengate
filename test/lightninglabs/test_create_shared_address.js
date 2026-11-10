const {deepEqual} = require('node:assert').strict;
const {rejects} = require('node:assert').strict;
const test = require('node:test');

const {createSharedAddress} = require('./../../');

const address = 'bc1pj6mhp4mr6nzg85l8lwvrs8n850c76n9ykvnryu2q4zgtyzlly2js2papaf';
const clientKey = '031b84c5567b126440995d3ed5aaba0565d71e1834604819ff9c17f5e9d5dd078f';
const expiry = 14400;
const maxExpiryAddress = 'bc1p9rc8l2kqd57aqy4ka8zq6fu3zl7yhemxvsvkhzaudwhev99y583s283vdw';
const metadata = {get: () => []};
const serverKey = '024d4b6cd1361032ca9bd2aeb9d900aa4d45d9ead80ac9423374c451a7254d0766';

const makeService = ({overrides}) => {
  const params = {expiry, server_key: Buffer.from(serverKey, 'hex')};

  Object.keys(overrides || {}).forEach(k => params[k] = overrides[k]);

  return {
    serverNewAddress: (args, auth, cbk) => {
      if (!args.client_key.equals(Buffer.from(clientKey, 'hex'))) {
        return cbk([400, 'InvalidClientKeySpecified']);
      }

      if (args.protocol_version !== 'V0') {
        return cbk([400, 'InvalidProtocolVersionSpecified']);
      }

      if (auth !== metadata) {
        return cbk([400, 'ExpectedAuthenticationMetadataPassedThrough']);
      }

      return cbk(null, {params});
    },
  };
};

const makeArgs = overrides => {
  const args = {
    metadata,
    network: 'btc',
    public_key: clientKey,
    service: makeService({}),
  };

  Object.keys(overrides).forEach(k => args[k] = overrides[k]);

  return args;
};

// A callback that throws, it is not expected to be called again with an error
const throwingCallback = () => {
  const calls = [];

  return err => {
    calls.push(err);

    if (calls.length > 1 || !!err) {
      throw new Error('UnexpectedCallbackCall');
    }

    throw new Error('CallbackError');
  };
};

const tests = [
  {
    args: makeArgs({max_expiry: 0}),
    description: 'A max expiry is expected to be a positive block count',
    error: [400, 'ExpectedValidMaxExpiryToCreateSharedAddress'],
  },
  {
    args: makeArgs({max_expiry: 1.5}),
    description: 'A max expiry is expected to be a whole block count',
    error: [400, 'ExpectedValidMaxExpiryToCreateSharedAddress'],
  },
  {
    args: makeArgs({max_expiry: 28801}),
    description: 'A max expiry is expected to be at most 200 days',
    error: [400, 'ExpectedLowerMaxExpiryToCreateSharedAddress'],
  },
  {
    args: makeArgs({metadata: undefined}),
    description: 'Authentication metadata is expected',
    error: [400, 'ExpectedAuthMetadataToCreateSharedAddress'],
  },
  {
    args: makeArgs({network: undefined}),
    description: 'A network name is expected',
    error: [400, 'ExpectedKnownNetworkToCreateSharedAddress'],
  },
  {
    args: makeArgs({network: 'network'}),
    description: 'A known network name is expected',
    error: [400, 'ExpectedKnownNetworkToCreateSharedAddress'],
  },
  {
    args: makeArgs({public_key: undefined}),
    description: 'A public key is expected',
    error: [400, 'ExpectedPublicKeyToCreateSharedAddress'],
  },
  {
    args: makeArgs({public_key: clientKey.slice(2)}),
    description: 'A compressed public key is expected',
    error: [400, 'ExpectedCompressedPublicKeyToMakeSharedAddress'],
  },
  {
    args: makeArgs({public_key: `02${'0'.repeat(62)}05`}),
    description: 'A valid public key is expected',
    error: [400, 'ExpectedCompressedPublicKeyToMakeSharedAddress'],
  },
  {
    args: makeArgs({service: undefined}),
    description: 'A service object is expected',
    error: [400, 'ExpectedServiceToCreateSharedAddress'],
  },
  {
    args: makeArgs({service: {}}),
    description: 'A service object with a new address method is expected',
    error: [400, 'ExpectedServiceToCreateSharedAddress'],
  },
  {
    args: makeArgs({
      service: {
        serverNewAddress: ({}, {}, cbk) => cbk({details: 'payment required'}),
      },
    }),
    description: 'Payment required error is passed back',
    error: [402, 'PaymentRequiredToCreateSharedAddress'],
  },
  {
    args: makeArgs({service: {serverNewAddress: ({}, {}, cbk) => cbk('err')}}),
    description: 'Errors are passed back',
    error: [503, 'UnexpectedErrorCreatingSharedAddress', {err: 'err'}],
  },
  {
    args: makeArgs({service: {serverNewAddress: ({}, {}, cbk) => cbk()}}),
    description: 'A response is expected',
    error: [503, 'ExpectedResponseWhenCreatingSharedAddress'],
  },
  {
    args: makeArgs({
      service: {serverNewAddress: ({}, {}, cbk) => cbk(null, {params: null})},
    }),
    description: 'Address parameters are expected',
    error: [503, 'ExpectedParamsWhenCreatingSharedAddress'],
  },
  {
    args: makeArgs({service: makeService({overrides: {server_key: null}})}),
    description: 'A server key is expected',
    error: [503, 'ExpectedServerKeyWhenCreatingSharedAddress'],
  },
  {
    args: makeArgs({
      service: makeService({
        overrides: {server_key: Buffer.from(serverKey.slice(2), 'hex')},
      }),
    }),
    description: 'A compressed server key is expected',
    error: [503, 'ExpectedCompressedServerKeyForSharedAddress'],
  },
  {
    args: makeArgs({
      service: makeService({
        overrides: {server_key: Buffer.from(`03${'f'.repeat(64)}`, 'hex')},
      }),
    }),
    description: 'A valid server key is expected',
    error: [503, 'ExpectedCompressedServerKeyForSharedAddress'],
  },
  {
    args: makeArgs({service: makeService({overrides: {expiry: 0}})}),
    description: 'An expiry is expected',
    error: [503, 'ExpectedExpiryWhenCreatingSharedAddress'],
  },
  {
    args: makeArgs({service: makeService({overrides: {expiry: 28801}})}),
    description: 'An expiry of at most 200 days is expected',
    error: [503, 'ExpectedLowerExpiryWhenCreatingSharedAddress'],
  },
  {
    args: makeArgs({max_expiry: expiry - 1}),
    description: 'An expiry of at most the max expiry is expected',
    error: [503, 'ExpectedLowerExpiryWhenCreatingSharedAddress'],
  },
  {
    args: makeArgs({}),
    description: 'Create a shared address',
    expected: {address, expiry, service_public_key: serverKey},
  },
  {
    args: makeArgs({
      service: makeService({
        overrides: {
          server_key: Buffer.from(serverKey, 'hex').toString('base64'),
        },
      }),
    }),
    description: 'Create a shared address with a base64 encoded server key',
    expected: {address, expiry, service_public_key: serverKey},
  },
  {
    args: makeArgs({max_expiry: expiry}),
    description: 'Create a shared address with an expiry at the max expiry',
    expected: {address, expiry, service_public_key: serverKey},
  },
  {
    args: makeArgs({service: makeService({overrides: {expiry: 28800}})}),
    description: 'Create a shared address with the maximum expiry',
    expected: {
      address: maxExpiryAddress,
      expiry: 28800,
      service_public_key: serverKey,
    },
  },
  {
    args: makeArgs({}),
    cbk: throwingCallback(),
    description: 'A callback that throws is not called again with an error',
    error: new Error('CallbackError'),
  },
];

tests.forEach(({args, cbk, description, error, expected}) => {
  return test(description, async () => {
    if (!!error) {
      await rejects(createSharedAddress(args, cbk), error, 'Got error');
    } else {
      deepEqual(await createSharedAddress(args), expected, 'Got address');
    }

    return;
  });
});

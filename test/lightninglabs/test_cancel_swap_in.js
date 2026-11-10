const {rejects} = require('node:assert').strict;
const test = require('node:test');

const {cancelSwapIn} = require('./../../');

const id = Buffer.alloc(32, 1).toString('hex');
const metadata = {get: () => []};
const missing = 'client did not provide fallback tx signatures for all fee rates';

const makeArgs = overrides => {
  const args = {
    id,
    metadata,
    service: {
      pushStaticAddressHtlcSigs: (args, auth, cbk) => {
        if (args.swap_hash.toString('hex') !== id) {
          return cbk([400, 'ExpectedSwapHashToCancel']);
        }

        if (Object.keys(args).length !== 1) {
          return cbk([400, 'ExpectedOnlySwapHashToCancel']);
        }

        if (auth !== metadata) {
          return cbk([400, 'ExpectedAuthenticationMetadataPassedThrough']);
        }

        return cbk();
      },
    },
  };

  Object.keys(overrides).forEach(k => args[k] = overrides[k]);

  return args;
};

const tests = [
  {
    args: makeArgs({id: undefined}),
    description: 'A swap hash is expected',
    error: [400, 'ExpectedSwapHashToCancelSwapIn'],
  },
  {
    args: makeArgs({id: 'id'}),
    description: 'A valid swap hash is expected',
    error: [400, 'ExpectedSwapHashToCancelSwapIn'],
  },
  {
    args: makeArgs({metadata: undefined}),
    description: 'Authentication metadata is expected',
    error: [400, 'ExpectedAuthMetadataToCancelSwapIn'],
  },
  {
    args: makeArgs({service: undefined}),
    description: 'A service is expected',
    error: [400, 'ExpectedServiceToCancelSwapIn'],
  },
  {
    args: makeArgs({service: {}}),
    description: 'A service with a push HTLC signatures method is expected',
    error: [400, 'ExpectedServiceToCancelSwapIn'],
  },
  {
    args: makeArgs({
      service: {pushStaticAddressHtlcSigs: ({}, {}, cbk) => cbk('err')},
    }),
    description: 'Errors are passed back',
    error: [503, 'UnexpectedErrorCancelingSwapIn', {err: 'err'}],
  },
  {
    args: makeArgs({}),
    description: 'Cancel a swap in',
  },
  {
    args: makeArgs({
      service: {
        pushStaticAddressHtlcSigs: ({}, {}, cbk) => cbk({
          code: 2,
          details: `${missing} for swap hash ${id}`,
        }),
      },
    }),
    description: 'The service answers a canceled swap with an error',
  },
];

tests.forEach(({args, description, error}) => {
  return test(description, async () => {
    if (!!error) {
      await rejects(cancelSwapIn(args), error, 'Got expected error');
    } else {
      await cancelSwapIn(args);
    }

    return;
  });
});

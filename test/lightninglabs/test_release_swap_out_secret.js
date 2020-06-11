const {test} = require('tap');

const {releaseSwapOutSecret} = require('./../../');

const makeArgs = override => {
  const args = {
    auth_macaroon: Buffer.alloc(32).toString('base64'),
    auth_preimage: Buffer.alloc(32).toString('hex'),
    secret: Buffer.alloc(32).toString('hex'),
    service: {
      loopOutPushPreimage: (args, metadata, cbk) => {
        if (args.protocol_version !== 'PREIMAGE_PUSH_LOOP_OUT') {
          return cbk([400, 'InvalidProtocolVersionSpecified']);
        }

        return cbk();
      },
    },
  };

  Object.keys(override).forEach(key => args[key] = override[key]);

  return args;
};

const tests = [
  {
    args: makeArgs({}),
    description: 'Release the preimage to the server',
  },
  {
    args: makeArgs({auth_macaroon: undefined}),
    description: 'Releasing the preimage requires an auth macaroon',
    error: [400, 'ExpectedAuthenticationMacaroonToRevealSecret'],
  },
  {
    args: makeArgs({auth_preimage: undefined}),
    description: 'Releasing the preimage requires an auth preimage',
    error: [400, 'ExpectedAuthenticationPreimageToRevealSecret'],
  },
  {
    args: makeArgs({secret: undefined}),
    description: 'Releasing the preimage to the server requires the preimage',
    error: [400, 'ExpectedHexEncodedSecretToRevealForSwapOut'],
  },
  {
    args: makeArgs({service: undefined}),
    description: 'Releasing the preimage to the server requires service obj',
    error: [400, 'ExpectedSwapServiceToRevealSwapOutSecret'],
  },
  {
    args: makeArgs({service: {}}),
    description: 'Releasing the preimage to the server requires release func',
    error: [400, 'ExpectedSwapServiceToRevealSwapOutSecret'],
  },
  {
    args: makeArgs({
      service: {
        loopOutPushPreimage: (args, metadata, cbk) => {
          return cbk('err');
        },
      },
    }),
    description: 'An error releasing the preimage is passed back',
    error: [503, 'UnexpectedErrorPushingPreimageForSwap', {err: 'err'}],
  },
];

tests.forEach(({args, description, error, expected}) => {
  return test(description, async ({equal, end, rejects}) => {
    if (!!error) {
      await rejects(releaseSwapOutSecret(args), error, 'Got expected error');

      return end();
    }

    await releaseSwapOutSecret(args);

    return end();
  });
});
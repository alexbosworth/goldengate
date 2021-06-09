const {test} = require('tap');

const {cancelSwapOut} = require('./../../');

const makeService = ({err}) => {
  return {cancelLoopOutSwap: ({}, {}, cbk) => cbk(err)};
};

const makeArgs = overrides => {
  const args = {
    id: Buffer.alloc(32).toString('hex'),
    metadata: {},
    payment: Buffer.alloc(32).toString('hex'),
    service: makeService({}),
  };

  Object.keys(overrides).forEach(k => args[k] = overrides[k]);

  return args;
};

const tests = [
  {
    args: makeArgs({id: undefined}),
    description: 'Expected id to cancel swap out',
    error: [400, 'ExpectedPaymentHashToCancelSwapOut'],
  },
  {
    args: makeArgs({metadata: undefined}),
    description: 'Expected metadata to cancel swap out',
    error: [400, 'ExpectedAuthenticationMetadataToCancelSwapOut'],
  },
  {
    args: makeArgs({payment: undefined}),
    description: 'Expected payment identifier to cancel swap out',
    error: [400, 'ExpectedPaymentIdentifierToCancelSwapOut'],
  },
  {
    args: makeArgs({service: undefined}),
    description: 'Expected service to cancel swap out',
    error: [400, 'ExpectedServiceToCancelSwapOut'],
  },
  {
    args: makeArgs({service: makeService({err: 'err'})}),
    description: 'Swap out cancel has an error',
    error: [503, 'UnexpectedErrorCancelingSwapOut', {err: 'err'}],
  },
  {
    args: makeArgs({}),
    description: 'Swap out is canceled',
  },
];

tests.forEach(({args, description, error, expected}) => {
  return test(description, async ({equal, end, rejects}) => {
    if (!!error) {
      await rejects(cancelSwapOut(args), error, 'Got expected error');
    } else {
      const res = await cancelSwapOut(args);
    }

    return end();
  });
});

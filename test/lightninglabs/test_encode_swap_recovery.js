const {test} = require('@alexbosworth/tap');

const {decodeSwapRecovery} = require('./../../');
const {encodeSwapRecovery} = require('./../../');

const script = '8201208763a91423d93e25796298628506157d4ab530aa0b255b3088210366d6a3884e943c40a10c85220753548fb7e15dd20752f6fa026d5dd5737f4a5a677503d2f017b1752103e3bac33098e754869051b86df8ee9d82eebe743f5143adbb7444ee978ad4315b68ac';

const makeArgs = overrides => {
  const args = {
    claim_private_key: 'fc2d30c764199da720f98842fd3e76ca01cbca3dda854b1852239cc45a92b3d1',
    execution_id: '3356daccaddd39093e2ea11a25e7b46719ee86c5e76577678e7358ce8e55a5e4',
    refund_public_key: '03e3bac33098e754869051b86df8ee9d82eebe743f5143adbb7444ee978ad4315b',
    secret: 'e2837e614d63d1df2cc765a07abde483013913074c40df3a64f59d8a1991956c',
    start_height: 1568878,
    sweep_address: 'tb1qvhk8rhpgn3h586sxdy3n8r95z6h33nt52tyevn',
    timeout: 1568978,
    tokens: 250000,
  };

  Object.keys(overrides).forEach(k => args[k] = overrides[k]);

  return args;
};

const tests = [
  {
    args: makeArgs({}),
    description: 'Encode swap recovery for a claim',
    expected: {},
  },
  {
    args: makeArgs({version: 2}),
    description: 'Encode swap recovery for a v2 claim',
    expected: {
      script: '210366d6a3884e943c40a10c85220753548fb7e15dd20752f6fa026d5dd5737f4a5aac6476a914bab88c089ed2a31125d8af7b3c3819b942dacfa988ad03d2f017b16782012088a91423d93e25796298628506157d4ab530aa0b255b308851b268',
    },
  },
  {
    args: makeArgs({sweep_address: undefined}),
    description: 'Encode swap with no sweep address',
    expected: {},
  },
  {
    args: makeArgs({secret: undefined}),
    description: 'A secret is expected when there is a claim key',
    error: 'ExpectedClaimSecretToEncodeClaimRecovery',
  },
  {
    args: makeArgs({claim_private_key: undefined}),
    description: 'A claim key is expected',
    error: 'ExpectedClaimKeyToEncodeSwapRecovery',
  },
  {
    args: makeArgs({refund_public_key: undefined}),
    description: 'A refund key is expected',
    error: 'ExpectedRefundPublicKeyToEncodeClaimRecovery',
  },
  {
    args: makeArgs({execution_id: undefined}),
    description: 'An execution id is expected',
    error: 'ExpectedSwapHashHexStringToEncodeRecovery',
  },
  {
    args: makeArgs({
      claim_private_key: undefined,
      claim_public_key: Buffer.alloc(33).toString('hex'),
      refund_public_key: undefined,
    }),
    description: 'An refund key is expected',
    error: 'ExpectedRefundKeyToEncodeSwapRecovery',
  },
  {
    args: makeArgs({
      refund_private_key: Buffer.alloc(33).toString('hex'),
    }),
    description: 'A claim public key is expected',
    error: 'ExpectedClaimPublicKeyToEncodeRefundRecovery',
  },
  {
    args: makeArgs({start_height: undefined}),
    description: 'A swap start height is expected',
    error: 'ExpectedSwapStartHeightToEncodeSwapRecovery',
  },
  {
    args: makeArgs({timeout: undefined}),
    description: 'A swap timeout height is expected',
    error: 'ExpectedSwapTimeoutToEncodeSwapRecovery',
  },
  {
    args: makeArgs({tokens: undefined}),
    description: 'A swap tokens amount is expected',
    error: 'ExpectedSwapTokensToEncodeSwapRecovery',
  },
  {
    args: makeArgs({version: 'version'}),
    description: 'A known version is expected',
    error: 'ExpectedSwapVersionToEncodeSwapRecovery',
  },
];

tests.forEach(({args, description, error, expected}) => {
  return test(description, async ({end, equal, throws}) => {
    if (!!error) {
      throws(() => encodeSwapRecovery(args), new Error(error), 'Got error');
    } else {
      const {recovery} = encodeSwapRecovery(args);

      const got = await decodeSwapRecovery({recovery});

      equal(got.claim_private_key, args.claim_private_key, 'Got claim key');
      equal(got.claim_public_key, args.claim_public_key, 'Got claim pubkey');
      equal(got.execution_id, args.execution_id, 'Got execution id');
      equal(got.id, args.id, 'Got swap id');
      equal(got.refund_private_key, args.refund_private_key, 'Got refund key');
      equal(got.refund_public_key, args.refund_public_key, 'Got refund key');
      equal(got.script, expected.script || script, 'Got script');
      equal(got.secret, args.secret, 'Got secret');
      equal(got.start_height, args.start_height, 'Got start height');
      equal(got.sweep_address, args.sweep_address, 'Got sweep address');
      equal(got.timeout, args.timeout, 'Got timeout');
      equal(got.tokens, args.tokens, 'Got tokens');
    }

    return end();
  });
});

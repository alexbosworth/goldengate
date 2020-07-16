const {test} = require('@alexbosworth/tap');

const {decodeSwapRecovery} = require('./../../');
const {encodeSwapRecovery} = require('./../../');

const script = '8201208763a91423d93e25796298628506157d4ab530aa0b255b3088210366d6a3884e943c40a10c85220753548fb7e15dd20752f6fa026d5dd5737f4a5a677503d2f017b1752103e3bac33098e754869051b86df8ee9d82eebe743f5143adbb7444ee978ad4315b68ac';

const tests = [
  {
    args: {
      claim_private_key: 'fc2d30c764199da720f98842fd3e76ca01cbca3dda854b1852239cc45a92b3d1',
      execution_id: '3356daccaddd39093e2ea11a25e7b46719ee86c5e76577678e7358ce8e55a5e4',
      refund_public_key: '03e3bac33098e754869051b86df8ee9d82eebe743f5143adbb7444ee978ad4315b',
      secret: 'e2837e614d63d1df2cc765a07abde483013913074c40df3a64f59d8a1991956c',
      start_height: 1568878,
      sweep_address: 'tb1qvhk8rhpgn3h586sxdy3n8r95z6h33nt52tyevn',
      timeout: 1568978,
      tokens: 250000,
    },
    description: 'Encode swap recovery',
  },
];

tests.forEach(({args, description}) => {
  return test(description, async ({end, equal}) => {
    const {recovery} = encodeSwapRecovery(args);

    const got = await decodeSwapRecovery({recovery});

    equal(got.claim_private_key, args.claim_private_key, 'Got claim privkey');
    equal(got.claim_public_key, args.claim_public_key, 'Got claim pubkey');
    equal(got.execution_id, args.execution_id, 'Got execution id');
    equal(got.id, args.id, 'Got swap id');
    equal(got.refund_private_key, args.refund_private_key, 'Got refund key');
    equal(got.refund_public_key, args.refund_public_key, 'Got refund pubkey');
    equal(got.script, script, 'Got script');
    equal(got.secret, args.secret, 'Got secret');
    equal(got.start_height, args.start_height, 'Got start height');
    equal(got.sweep_address, args.sweep_address, 'Got sweep address');
    equal(got.timeout, args.timeout, 'Got timeout');
    equal(got.tokens, args.tokens, 'Got tokens');

    return end();
  });
});

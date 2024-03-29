const {deepEqual} = require('node:assert').strict;
const {rejects} = require('node:assert').strict;
const test = require('node:test');

const {decodeSwapRecovery} = require('./../../');

const makeArgs = overrides => {
  const args = {
    recovery: 'ac71636c61696d5f707269766174655f6b657978406663326433306337363431393964613732306639383834326664336537366361303163626361336464613835346231383532323339636334356139326233643170636c61696d5f7075626c69635f6b6579f76c657865637574696f6e5f6964784033333536646163636164646433393039336532656131316132356537623436373139656538366335653736353737363738653733353863653865353561356534626964f772726566756e645f707269766174655f6b6579f771726566756e645f7075626c69635f6b65797842303365336261633333303938653735343836393035316238366466386565396438326565626537343366353134336164626237343434656539373861643433313562667365637265747840653238333765363134643633643164663263633736356130376162646534383330313339313330373463343064663361363466353964386131393931393536636c73746172745f6865696768741a0017f06e6d73776565705f61646472657373782a7462317176686b38726870676e336835383673786479336e387239357a366833336e743532747965766e6774696d656f75741a0017f0d266746f6b656e731a0003d0906776657273696f6ef7',
  };

  Object.keys(overrides).forEach(k => args[k] = overrides[k]);

  return args;
};

const tests = [
  {
    args: makeArgs({recovery: undefined}),
    description: 'A recovery value is expected',
    error: [400, 'ExpectedRecoveryHexStringToDecode'],
  },
  {
    args: makeArgs({}),
    description: 'Decode swap recovery',
    expected: {
      recovery: {
        claim_private_key: 'fc2d30c764199da720f98842fd3e76ca01cbca3dda854b1852239cc45a92b3d1',
        claim_public_key: undefined,
        execution_id: '3356daccaddd39093e2ea11a25e7b46719ee86c5e76577678e7358ce8e55a5e4',
        id: undefined,
        refund_private_key: undefined,
        refund_public_key: '03e3bac33098e754869051b86df8ee9d82eebe743f5143adbb7444ee978ad4315b',
        script: '8201208763a91423d93e25796298628506157d4ab530aa0b255b3088210366d6a3884e943c40a10c85220753548fb7e15dd20752f6fa026d5dd5737f4a5a677503d2f017b1752103e3bac33098e754869051b86df8ee9d82eebe743f5143adbb7444ee978ad4315b68ac',
        secret: 'e2837e614d63d1df2cc765a07abde483013913074c40df3a64f59d8a1991956c',
        start_height: 1568878,
        sweep_address: 'tb1qvhk8rhpgn3h586sxdy3n8r95z6h33nt52tyevn',
        timeout: 1568978,
        tokens: 250000,
        version: undefined,
      },
    },
  },
];

tests.forEach(({args, description, error, expected}) => {
  return test(description, async () => {
    if (!!error) {
      await rejects(decodeSwapRecovery(args), error, 'Got expected error');
    } else {
      const recovery = await decodeSwapRecovery(args);

      deepEqual(recovery, expected.recovery, 'Got expected recovery');
    }

    return;
  });
});

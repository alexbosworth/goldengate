const {deepEqual} = require('node:assert').strict;
const test = require('node:test');
const {throws} = require('node:assert').strict;

const lightninglabs = './../../lightninglabs/';

const encodeCborMap = require(`${lightninglabs}encode_cbor_map`);

const tests = [
  {
    args: {map: {}},
    description: 'Encode an empty map',
    expected: {encoded: 'a0'},
  },
  {
    args: {
      map: {
        a: 23,
        b: 24,
        c: 255,
        d: 256,
        e: 65535,
        f: 65536,
        g: 4294967295,
        h: 4294967296,
        i: 9007199254740991,
      },
    },
    description: 'Encode unsigned integers at every width boundary',
    expected: {
      encoded: 'a961611761621818616318ff6164190100616519ffff61661a0001000061671affffffff61681b000000010000000061691b001fffffffffffff',
    },
  },
  {
    args: {
      map: {
        empty: '',
        short: 'x'.repeat(23),
        one_byte_len: 'x'.repeat(24),
        two_byte_len: 'x'.repeat(256),
        multibyte: 'é中😀',
        missing: undefined,
      },
    },
    description: 'Encode text strings at every length boundary and undefined',
    expected: {
      encoded: [
        'a6',
        '65656d70747960',
        '6573686f7274' + '77' + '78'.repeat(23),
        '6c6f6e655f627974655f6c656e' + '7818' + '78'.repeat(24),
        '6c74776f5f627974655f6c656e' + '790100' + '78'.repeat(256),
        '696d756c746962797465' + '69c3a9e4b8adf09f9880',
        '676d697373696e67' + 'f7',
      ].join(''),
    },
  },
  {
    args: {
      map: {
        claim_private_key: 'fc2d30c764199da720f98842fd3e76ca01cbca3dda854b1852239cc45a92b3d1',
        claim_public_key: undefined,
        execution_id: '3356daccaddd39093e2ea11a25e7b46719ee86c5e76577678e7358ce8e55a5e4',
        id: undefined,
        refund_private_key: undefined,
        refund_public_key: '03e3bac33098e754869051b86df8ee9d82eebe743f5143adbb7444ee978ad4315b',
        secret: 'e2837e614d63d1df2cc765a07abde483013913074c40df3a64f59d8a1991956c',
        start_height: 1568878,
        sweep_address: 'tb1qvhk8rhpgn3h586sxdy3n8r95z6h33nt52tyevn',
        timeout: 1568978,
        tokens: 250000,
        version: undefined,
      },
    },
    description: 'Encode a swap recovery map identically to the cbor package',
    expected: {
      encoded: 'ac71636c61696d5f707269766174655f6b657978406663326433306337363431393964613732306639383834326664336537366361303163626361336464613835346231383532323339636334356139326233643170636c61696d5f7075626c69635f6b6579f76c657865637574696f6e5f6964784033333536646163636164646433393039336532656131316132356537623436373139656538366335653736353737363738653733353863653865353561356534626964f772726566756e645f707269766174655f6b6579f771726566756e645f7075626c69635f6b65797842303365336261633333303938653735343836393035316238366466386565396438326565626537343366353134336164626237343434656539373861643433313562667365637265747840653238333765363134643633643164663263633736356130376162646534383330313339313330373463343064663361363466353964386131393931393536636c73746172745f6865696768741a0017f06e6d73776565705f61646472657373782a7462317176686b38726870676e336835383673786479336e387239357a366833336e743532747965766e6774696d656f75741a0017f0d266746f6b656e731a0003d0906776657273696f6ef7',
    },
  },
  {
    args: {map: {a: 1.5}},
    description: 'A float is not supported',
    error: 'UnsupportedValueTypeToEncodeAsCbor',
  },
  {
    args: {map: {a: -1}},
    description: 'A negative integer is not supported',
    error: 'UnsupportedValueTypeToEncodeAsCbor',
  },
  {
    args: {map: {a: 9007199254740992}},
    description: 'An unsafe integer is not supported',
    error: 'UnsupportedValueTypeToEncodeAsCbor',
  },
  {
    args: {map: {a: null}},
    description: 'A null value is not supported',
    error: 'UnsupportedValueTypeToEncodeAsCbor',
  },
  {
    args: {map: {a: Buffer.alloc(1)}},
    description: 'A buffer value is not supported',
    error: 'UnsupportedValueTypeToEncodeAsCbor',
  },
  {
    args: {map: {a: {}}},
    description: 'A nested map is not supported',
    error: 'UnsupportedValueTypeToEncodeAsCbor',
  },
];

tests.forEach(({args, description, error, expected}) => {
  return test(description, (t, end) => {
    if (!!error) {
      throws(() => encodeCborMap(args), new Error(error), 'Got error');
    } else {
      const {encoded} = encodeCborMap(args);

      deepEqual(encoded.toString('hex'), expected.encoded, 'Got encoded');
    }

    return end();
  });
});

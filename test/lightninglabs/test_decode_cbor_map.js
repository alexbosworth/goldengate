const {deepEqual} = require('node:assert').strict;
const test = require('node:test');
const {throws} = require('node:assert').strict;

const lightninglabs = './../../lightninglabs/';

const decodeCborMap = require(`${lightninglabs}decode_cbor_map`);

const makeArgs = hex => ({encoded: Buffer.from(hex, 'hex')});

const tests = [
  {
    args: makeArgs('a0'),
    description: 'Decode an empty map',
    expected: {decoded: {}},
  },
  {
    args: makeArgs('f6'),
    description: 'Decode null',
    expected: {decoded: null},
  },
  {
    args: makeArgs('f7'),
    description: 'Decode undefined',
    expected: {decoded: undefined},
  },
  {
    args: makeArgs('a961611761621818616318ff6164190100616519ffff61661a0001000061671affffffff61681b000000010000000061691b001fffffffffffff'),
    description: 'Decode unsigned integers at every width boundary',
    expected: {
      decoded: {
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
  },
  {
    args: makeArgs([
      'a6',
      '65656d70747960',
      '6573686f7274' + '77' + '78'.repeat(23),
      '6c6f6e655f627974655f6c656e' + '7818' + '78'.repeat(24),
      '6c74776f5f627974655f6c656e' + '790100' + '78'.repeat(256),
      '696d756c746962797465' + '69c3a9e4b8adf09f9880',
      '676d697373696e67' + 'f7',
    ].join('')),
    description: 'Decode text strings at every length boundary and undefined',
    expected: {
      decoded: {
        empty: '',
        short: 'x'.repeat(23),
        one_byte_len: 'x'.repeat(24),
        two_byte_len: 'x'.repeat(256),
        multibyte: 'é中😀',
        missing: undefined,
      },
    },
  },
  {
    args: makeArgs('ac71636c61696d5f707269766174655f6b6579f770636c61696d5f7075626c69635f6b657978423033363664366133383834653934336334306131306338353232303735333534386662376531356464323037353266366661303236643564643537333766346135616c657865637574696f6e5f6964f762696478406538333766393439376366396237663137326139643364613933643736376635373738333836353536656433616338323235646439393862613238646531666472726566756e645f707269766174655f6b657978403031303130313031303130313031303130313031303130313031303130313031303130313031303130313031303130313031303130313031303130313031303171726566756e645f7075626c69635f6b6579f766736563726574f76c73746172745f6865696768741a0017f06e6d73776565705f61646472657373f76774696d656f75741a0017f0d266746f6b656e731a0003d0906776657273696f6e02'),
    description: 'Decode a swap recovery map encoded by the cbor package',
    expected: {
      decoded: {
        claim_private_key: undefined,
        claim_public_key: '0366d6a3884e943c40a10c85220753548fb7e15dd20752f6fa026d5dd5737f4a5a',
        execution_id: undefined,
        id: 'e837f9497cf9b7f172a9d3da93d767f5778386556ed3ac8225dd998ba28de1fd',
        refund_private_key: '0101010101010101010101010101010101010101010101010101010101010101',
        refund_public_key: undefined,
        secret: undefined,
        start_height: 1568878,
        sweep_address: undefined,
        timeout: 1568978,
        tokens: 250000,
        version: 2,
      },
    },
  },
  {
    args: makeArgs(''),
    description: 'Input is expected',
    error: 'UnexpectedEndOfCborInput',
  },
  {
    args: makeArgs('a5'),
    description: 'A truncated map is rejected',
    error: 'UnexpectedEndOfCborInput',
  },
  {
    args: makeArgs('6361'),
    description: 'A truncated text string is rejected',
    error: 'UnexpectedEndOfCborInput',
  },
  {
    args: makeArgs('a1616101ff'),
    description: 'Trailing data is rejected',
    error: 'UnexpectedTrailingCborData',
  },
  {
    args: makeArgs('ff'),
    description: 'A break code is rejected',
    error: 'UnsupportedCborSimpleValue',
  },
  {
    args: makeArgs('a16161f842'),
    description: 'An unknown simple value is rejected',
    error: 'UnsupportedCborSimpleValue',
  },
  {
    args: makeArgs('bf616101ff'),
    description: 'An indefinite length map is rejected',
    error: 'UnsupportedCborAdditionalInformation',
  },
  {
    args: makeArgs('a161614101'),
    description: 'A byte string is rejected',
    error: 'UnsupportedCborMajorType',
  },
  {
    args: makeArgs('a16161f93c00'),
    description: 'A float is rejected',
    error: 'UnsupportedCborSimpleValue',
  },
  {
    args: makeArgs('a1616120'),
    description: 'A negative integer is rejected',
    error: 'UnsupportedCborMajorType',
  },
  {
    args: makeArgs('a161618101'),
    description: 'An array is rejected',
    error: 'UnsupportedCborMajorType',
  },
  {
    args: makeArgs('a16161c101'),
    description: 'A tag is rejected',
    error: 'UnsupportedCborMajorType',
  },
  {
    args: makeArgs('a16161a1616201'),
    description: 'A nested map is rejected',
    error: 'UnsupportedNestedCborMap',
  },
  {
    args: makeArgs('a10101'),
    description: 'A non-text key is rejected',
    error: 'UnsupportedCborMapKey',
  },
  {
    args: makeArgs('a1695f5f70726f746f5f5f01'),
    description: 'A prototype key is rejected',
    error: 'UnsupportedCborMapKey',
  },
  {
    args: makeArgs('a161611b0020000000000000'),
    description: 'An unsafe integer is rejected',
    error: 'UnsupportedCborIntegerSize',
  },
];

tests.forEach(({args, description, error, expected}) => {
  return test(description, (t, end) => {
    if (!!error) {
      throws(() => decodeCborMap(args), new Error(error), 'Got error');
    } else {
      const {decoded} = decodeCborMap(args);

      deepEqual(decoded, expected.decoded, 'Got decoded');
    }

    return end();
  });
});

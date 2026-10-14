const {equal} = require('node:assert').strict;
const test = require('node:test');
const {throws} = require('node:assert').strict;

const method = require('./../../transactions/encode_signature');

const hexAsBuffer = hex => Buffer.from(hex, 'hex');

const tests = [
  {
    args: {
      flag: 1,
      signature: hexAsBuffer('3609e17b84f6a7d30c80bfa610b5b4542f32a8a0d5447a12fb1366d7f01cc44a573a954c4518331561406f90300e8f3358f51928d43c212a8caed02de67eebee'),
    },
    description: 'BIP 143 native P2WPKH example signature is encoded',
    expected: '304402203609e17b84f6a7d30c80bfa610b5b4542f32a8a0d5447a12fb1366d7f01cc44a0220573a954c4518331561406f90300e8f3358f51928d43c212a8caed02de67eebee01',
  },
  {
    args: {
      flag: 1,
      signature: hexAsBuffer('cbdb8b86250888f27a587315242b68dddf249c35fa1be0b2fb66f7f684c6224601d56bd1f626ae84119675b4ac8df267bb8eac4f5d0dd2d6b65663b8e4631ae8'),
    },
    description: 'An R value with the high bit set gets a leading zero',
    expected: '3045022100cbdb8b86250888f27a587315242b68dddf249c35fa1be0b2fb66f7f684c62246022001d56bd1f626ae84119675b4ac8df267bb8eac4f5d0dd2d6b65663b8e4631ae801',
  },
  {
    args: {
      flag: 1,
      signature: hexAsBuffer('30bd7535e6c3b43e89967b9472f29720ace31e9647250bebd08865e8181abcd6007ca23d84267d19953409d894d84008c9fe2c7bf4aaa570bd95f746265df504'),
    },
    description: 'An S value with a leading zero byte is shortened',
    expected: '3043022030bd7535e6c3b43e89967b9472f29720ace31e9647250bebd08865e8181abcd6021f7ca23d84267d19953409d894d84008c9fe2c7bf4aaa570bd95f746265df50401',
  },
  {
    args: {
      flag: 0x83,
      signature: hexAsBuffer('0000ff112233445566778899001122334455667788990011223344556677889900000000000000000000000000000000000000000000000000000000000000ff'),
    },
    description: 'Leading zeros are removed before a high bit is padded',
    expected: '3025021f00ff1122334455667788990011223344556677889900112233445566778899020200ff83',
  },
  {
    args: {
      flag: 2,
      signature: hexAsBuffer('7f000000000000000000000000000000000000000000000000000000000000008000000000000000000000000000000000000000000000000000000000000000'),
    },
    description: 'An S value with the high bit set gets a leading zero',
    expected: '304502207f00000000000000000000000000000000000000000000000000000000000000022100800000000000000000000000000000000000000000000000000000000000000002',
  },
  {
    args: {flag: 1, signature: Buffer.alloc(64)},
    description: 'Zero values are encoded as a single zero byte',
    expected: '300602010002010001',
  },
  {
    args: {signature: Buffer.alloc(64, 1)},
    description: 'A sighash flag is expected',
    error: 'ExpectedKnownSignatureHashTypeFlagToEncodeSignature',
  },
  {
    args: {flag: 0, signature: Buffer.alloc(64, 1)},
    description: 'A known sighash flag is expected',
    error: 'ExpectedKnownSignatureHashTypeFlagToEncodeSignature',
  },
  {
    args: {flag: 0x84, signature: Buffer.alloc(64, 1)},
    description: 'A known anyone can pay sighash flag is expected',
    error: 'ExpectedKnownSignatureHashTypeFlagToEncodeSignature',
  },
  {
    args: {flag: 1},
    description: 'A signature is expected',
    error: 'ExpectedCompactSignatureBytesToEncodeSignature',
  },
  {
    args: {flag: 1, signature: '01'.repeat(64)},
    description: 'Signature bytes are expected',
    error: 'ExpectedCompactSignatureBytesToEncodeSignature',
  },
  {
    args: {flag: 1, signature: Buffer.alloc(63, 1)},
    description: 'A compact length signature is expected',
    error: 'ExpectedCompactSignatureLengthToEncodeSignature',
  },
  {
    args: {flag: 1, signature: Buffer.alloc(72, 1)},
    description: 'A compact signature is expected, not a DER signature',
    error: 'ExpectedCompactSignatureLengthToEncodeSignature',
  },
];

tests.forEach(({args, description, error, expected}) => {
  return test(description, (t, end) => {
    if (!!error) {
      throws(() => method(args), new Error(error), 'Got expected error');
    } else {
      const {encoded} = method(args);

      equal(encoded.toString('hex'), expected, 'Got expected DER signature');
    }

    return end();
  });
});

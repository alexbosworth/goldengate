const {newMacaroon} = require('macaroon');
const {test} = require('@alexbosworth/tap');

const {swapUserId} = require('./../../');

const tests = [
  {
    args: {},
    description: 'A macaroon is required',
    error: 'ExpectedMacaroonToDeriveSwapUserId',
  },
  {
    args: {macaroon: Buffer.from(newMacaroon({
        rootKey: 'rootKey',
        identifier: Buffer.concat([
          Buffer.alloc(2, 1),
          Buffer.alloc(64),
        ]).toString(),
        location: 'location',
      }).exportBinary()).toString('base64'),
    },
    description: 'A known version number is expected',
    error: 'UnknownVersionForSwapUserId',
  },
  {
    args: {macaroon: Buffer.from(newMacaroon({
        rootKey: 'rootKey',
        identifier: '00',
        location: 'location',
      }).exportBinary()).toString('base64'),
    },
    description: 'A payment hash and id are expected in the identifier',
    error: 'UnexpectedLengthForSwapMacaroonIdentifier',
  },
  {
    args: {
      macaroon: 'AgEEbHNhdAJCAADXNkGQ+faRDM3Ey4M6YGALyTwqnLqDTNVgCBckgnpSZ4vd9z8+Ndr1+zLD6i/AmJIbDVuEAvBwgZBezq2hcys5AAIPc2VydmljZXM9bG9vcDowAAISbG9vcF9jYXBhYmlsaXRpZXM9AAAGIDPTqKe/hckryPR6hINTa7Dg8/bbxqVqq02/eBMpmt7Z',
    },
    description: 'Derive swap user id from a macaroon.',
    expected: {
      id: '8bddf73f3e35daf5fb32c3ea2fc098921b0d5b8402f07081905eceada1732b39',
    },
  },
  {
    args: {
      macaroon: Buffer.from('0201046c73617402420000901fb46b45e7cff43a83ba7b7871fdbc17950ba98481debf66dcbf2d004d83d4e09ca4df4c8b07d2ecde9dc3578b6c426b94075a9f289410d57f65c63cb09c9800020f73657276696365733d6c6f6f703a300002126c6f6f705f6361706162696c69746965733d0000062084e01becd4f15137bcb494d7874852a57cf7c2c972eb64257263ec0a05934ea2', 'hex').toString('base64'),
    },
    description: 'Derive swap user id from hex macaroon',
    expected: {
      id: 'e09ca4df4c8b07d2ecde9dc3578b6c426b94075a9f289410d57f65c63cb09c98',
    },
  },
];

tests.forEach(({args, description, error, expected}) => {
  return test(description, ({equal, end, throws}) => {
    if (!!error) {
      throws(() => swapUserId(args), new Error(error));
    } else {
      const {id} = swapUserId(args);

      equal(id, expected.id, 'Swap user id is returned');
    }

    return end();
  });
});

const {newMacaroon} = require('macaroon');
const {test} = require('tap');

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
    expected: {id: '8bddf73f3e35daf5fb32c3ea2fc098921b0d5b8402f07081905eceada1732b39'},
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

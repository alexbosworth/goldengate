const {test} = require('tap');

const {findSecret} = require('./../../blockstream');

const tests = [
  {
    args: {
      address: '2MuZSbMqRdSgRJNYqthHaUwaewiCL85mGvd',
      hash: '0941f5ee9603b4f7472e6342ba7e81676aa0bb81b18bb43f3c4eb019e1f057b4',
      network: 'btctestnet',
      request: ({}, cbk) => {
        return cbk(null, {statusCode: 200}, [{
          txid: Buffer.alloc(32).toString('hex'),
          vin: [{
            witness: [
              '30440220043c495d3cecfbfecc0d2b32991ced11a246b9992d4ec3fd336dd9eb5a5f0b4f02205420ea17b23d27807d07acb33741368c91bb133a8210a013ae096fb7c867477701',
              '4c7ecf5627ed7243bb9d425b1b687b4c08e5e391f5b58d6b4c384f5c612ad5a3',
              '8201208763a9146037b4b4fc1935511064a6312e59c2c45a40ed96882103027651638ccedadd3deae48f53aa54c9eea7d9715bff2aa2ddfe2a2963656403677503a3fd17b1752102d1ff0cd98439bd4738f56868637906d7ec872d851dc747a2e63fb85e9b49762d68ac',
            ],
          }],
        }]);
      },
    },
    description: 'Find a preimage secret',
    expected: {
      secret: '4c7ecf5627ed7243bb9d425b1b687b4c08e5e391f5b58d6b4c384f5c612ad5a3',
    },
  },
  {
    args: {},
    description: 'Finding preimage requires a address to watch for',
    error: [400, 'ExpectedAddressToFindHtlcSecretFromBlockstream'],
  },
  {
    args: {address: '2MuZSbMqRdSgRJNYqthHaUwaewiCL85mGvd'},
    description: 'Finding preimage requires a network to watch on',
    error: [400, 'ExpectedNetworkToFindHtlcSecretFromBlockstream'],
  },
  {
    args: {
      address: '2MuZSbMqRdSgRJNYqthHaUwaewiCL85mGvd',
      network: 'btctestnet',
    },
    description: 'Finding preimage requires a request method',
    error: [400, 'ExpectedRequestToFindHtlcSecretFromBlockstream'],
  },
];

tests.forEach(({args, description, error, expected}) => {
  return test(description, async ({equal, end, rejects}) => {
    if (!!error) {
      await rejects(findSecret(args), error, 'Returns expected error');

      return end();
    }

    const {secret} = await findSecret(args);

    equal(secret, expected.secret, 'Found htlc secret preimage');

    return end();
  });
});

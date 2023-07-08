const {deepEqual} = require('node:assert').strict;
const {rejects} = require('node:assert').strict;
const test = require('node:test');

const method = require('./../../funding/get_psbt_from_transaction');

const makeArgs = overrides => {
  const args = {
    network: 'btc',
    request: ({}, cbk) => cbk(
      null,
      {},
      '010000000001018962c86967d717090ae678eb0fb02e1b7cc036afad57ddf3e7c17ab025e29ee0010000001716001482c3d3a8b0317dc15f29f1d8cddb0d70e542b07cffffffff02c4166900000000002200200df13f481d8504547e9a768e04021d4633580e4e2ea30947bdb10696b73d49acfcc9731100000000160014ca6ee81f8110eac35eae23accb6d676284f9027d02483045022100dc00bebabdfb18633dabe7ddc3d2c1889608c7ce071178b9a6db7c2ab989655102207542fba17c272d5bf0145847d20559c45e9fd09a67e6a6c935eeba95e53e4c15012102e91f67abc81c5419bef5db1e76404117729052fcc325a91189fd417debbefc1e00000000'
    ),
    transaction: '01000000000101f0ea93013c35acbf94695db3bf806c0de68f5309d63f415f1f74548e37db277f0100000000ffffffff020000000100000000220020fdef2b21b827959dcaf3d31f8f0f859cd81ec5d335614ed4e338cdf8ce9d6fcb3692711000000000160014736fb0c4deb3259b49a3ecfc56e18dbdb6a2a757024730440220171fac3e95f5f2c98ae8c5115d71cf283683a68b23c418429e142f7dd478cc410220166d5f9e8a5a88ad154827072c38053155ce821e6f772ab0eb7c114a40512b6c0121026aeb31fdbb5c3a4511611dca0bdb5545b1828edc40344af2d8c8e26190313a7100000000',
  };

  Object.keys(overrides).forEach(k => args[k] = overrides[k]);

  return args;
};

const tests = [
  {
    args: makeArgs({network: undefined}),
    description: 'A network is expected.',
    error: [400, 'ExpectedNetworkNameToGetPsbtFromTransaction'],
  },
  {
    args: makeArgs({request: undefined}),
    description: 'A request function is expected.',
    error: [400, 'ExpectedRequestFunctionToGetPsbtFromTransaction'],
  },
  {
    args: makeArgs({transaction: undefined}),
    description: 'A hex encoded transaction is expected.',
    error: [400, 'ExpectedTransactionToGetPsbtFromTransaction'],
  },
  {
    args: makeArgs({}),
    description: 'PSBT is derived from a transaction',
    expected: {
      psbt: '70736274ff01007d0100000001f0ea93013c35acbf94695db3bf806c0de68f5309d63f415f1f74548e37db277f0100000000ffffffff020000000100000000220020fdef2b21b827959dcaf3d31f8f0f859cd81ec5d335614ed4e338cdf8ce9d6fcb3692711000000000160014736fb0c4deb3259b49a3ecfc56e18dbdb6a2a757000000000001086b024730440220171fac3e95f5f2c98ae8c5115d71cf283683a68b23c418429e142f7dd478cc410220166d5f9e8a5a88ad154827072c38053155ce821e6f772ab0eb7c114a40512b6c0121026aeb31fdbb5c3a4511611dca0bdb5545b1828edc40344af2d8c8e26190313a710100fd0201010000000001018962c86967d717090ae678eb0fb02e1b7cc036afad57ddf3e7c17ab025e29ee0010000001716001482c3d3a8b0317dc15f29f1d8cddb0d70e542b07cffffffff02c4166900000000002200200df13f481d8504547e9a768e04021d4633580e4e2ea30947bdb10696b73d49acfcc9731100000000160014ca6ee81f8110eac35eae23accb6d676284f9027d02483045022100dc00bebabdfb18633dabe7ddc3d2c1889608c7ce071178b9a6db7c2ab989655102207542fba17c272d5bf0145847d20559c45e9fd09a67e6a6c935eeba95e53e4c15012102e91f67abc81c5419bef5db1e76404117729052fcc325a91189fd417debbefc1e0000000001011ffcc9731100000000160014ca6ee81f8110eac35eae23accb6d676284f9027d000000',
    },
  },
];

tests.forEach(({args, description, error, expected}) => {
  return test(description, async () => {
    if (!!error) {
      await rejects(method(args), error, 'Got expected error');
    } else {
      const got = await method(args);

      deepEqual(got, expected, 'Got expected result');
    }

    return;
  });
});

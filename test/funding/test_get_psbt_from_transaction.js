const {test} = require('@alexbosworth/tap');

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
    args: makeArgs({
      request: ({}, cbk) => cbk(
        null,
        {},
        '0200000000010258e87a21b56daf0c23be8e7070456c336f7cbaa5c8757924f545887bb2abdd7500000000da00473044022074018ad4180097b873323c0015720b3684cc8123891048e7dbcd9b55ad679c99022073d369b740e3eb53dcefa33823c8070514ca55a7dd9544f157c167913261118c01483045022100f61038b308dc1da865a34852746f015772934208c6d24454393cd99bdf2217770220056e675a675a6d0a02b85b14e5e29074d8a25a9b5760bea2816f661910a006ea01475221029583bf39ae0a609747ad199addd634fa6108559d6c5cd39b4c2183f1ab96e07f2102dab61ff49a14db6a7d02b0cd1fbb78fc4b18312b5b4e54dae4dba2fbfef536d752aeffffffff838d0427d0ec650a68aa46bb0b098aea4422c071b2ca78352a077959d07cea1d01000000232200208c2353173743b595dfb4a07b72ba8e42e3797da74e87fe7d9d7497e3b2028903ffffffff0270aaf00800000000160014d85c2b71d0060b09c9886aeb815e50991dda124d00e1f5050000000016001400aea9a2e5f0f876a588df5546e8742d1d87008f000400473044022062eb7a556107a7c73f45ac4ab5a1dddf6f7075fb1275969a7f383efff784bcb202200c05dbb7470dbf2f08557dd356c7325c1ed30913e996cd3840945db12228da5f01473044022065f45ba5998b59a27ffe1a7bed016af1f1f90d54b3aa8f7450aa5f56a25103bd02207f724703ad1edb96680b284b56d4ffcb88f7fb759eabbe08aa30f29b851383d20147522103089dc10c7ac6db54f91329af617333db388cead0c231f723379d1b99030b02dc21023add904f3d6dcf59ddb906b0dee23529b7ffb9ed50e5e86151926860221f0e7352ae00000000'
      ),
    }),
    description: 'A transaction with known spending tx is expected.',
    error: [400, 'FailedToConvertTxToPsbt'],
  },
  {
    args: makeArgs({}),
    description: 'PSBT is derived from a transaction',
    expected: {
      psbt: '70736274ff01007d0100000001f0ea93013c35acbf94695db3bf806c0de68f5309d63f415f1f74548e37db277f0100000000ffffffff020000000100000000220020fdef2b21b827959dcaf3d31f8f0f859cd81ec5d335614ed4e338cdf8ce9d6fcb3692711000000000160014736fb0c4deb3259b49a3ecfc56e18dbdb6a2a757000000000001011ffcc9731100000000160014ca6ee81f8110eac35eae23accb6d676284f9027d01086b024730440220171fac3e95f5f2c98ae8c5115d71cf283683a68b23c418429e142f7dd478cc410220166d5f9e8a5a88ad154827072c38053155ce821e6f772ab0eb7c114a40512b6c0121026aeb31fdbb5c3a4511611dca0bdb5545b1828edc40344af2d8c8e26190313a71000000',
    },
  },
];

tests.forEach(({args, description, error, expected}) => {
  return test(description, async ({end, rejects, strictSame}) => {
    if (!!error) {
      await rejects(method(args), error, 'Got expected error');
    } else {
      const got = await method(args);

      strictSame(got, expected, 'Got expected result');
    }

    return end();
  });
});

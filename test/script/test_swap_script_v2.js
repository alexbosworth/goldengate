const {equal} = require('node:assert').strict;
const test = require('node:test');
const {throws} = require('node:assert').strict;

const {ECPair} = require('ecpair');
const tinysecp = require('tiny-secp256k1');

const {swapScriptV2} = require('./../../');

const tests = [
  {
    args: {
      claim_private_key: '79957dc2091c8b024e14ee7f338869174ae39674342f40cc804cb099145d1d97',
      secret: 'bdb8e03b149a48e3c706663b8cee7c7590bee386d5d8b5620fd504c848437e6e',
      refund_public_key: '027e919ee986cd0ad6e012932c709e82396321a82faee5355ca5def9d0934b526c',
      timeout: 1515658,
    },
    description: 'Derive script from privkey, preimage secret, service key.',
    expected: '21031cb9fba5d8cbc3dad06185e49de60fac484944c3c12682b604e0261b5375d3bfac6476a914f848f45b3156887fef19906babb85af645735d4e88ad038a2017b16782012088a914c792bea2f08a4dcada80a2e848e01f236bd139278851b268',
  },
  {
    args: {
      claim_private_key: '79957dc2091c8b024e14ee7f338869174ae39674342f40cc804cb099145d1d97',
      secret: 'bdb8e03b149a48e3c706663b8cee7c7590bee386d5d8b5620fd504c848437e6e',
      refund_public_key: '027e919ee986cd0ad6e012932c709e82396321a82faee5355ca5def9d0934b526c',
      timeout: 'foo',
    },
    description: 'Normal values are expected.',
    error: 'FailedToComposeSwapScriptElements',
  },
  {
    args: {
      claim_public_key: '027e919ee986cd0ad6e012932c709e82396321a82faee5355ca5def9d0934b526c',
      hash: Buffer.alloc(32).toString('hex'),
      refund_private_key: '79957dc2091c8b024e14ee7f338869174ae39674342f40cc804cb099145d1d97',
      timeout: 1515658,
    },
    description: 'Derive script v2 given hash, refund privkey, claim pubkey',
    expected: '21027e919ee986cd0ad6e012932c709e82396321a82faee5355ca5def9d0934b526cac6476a914382f1ac022fce4ff91259403111a6ebaf1e4831a88ad038a2017b16782012088a914d1a70126ff7a149ca6f9b638db084480440ff8428851b268',
  },
  {
    args: {},
    description: 'Derive script requires claim private key or public key',
    error: 'ExpectedEitherPrivateKeyOrPublicKeyForSwapScript',
  },
  {
    args: {
      claim_private_key: '79957dc2091c8b024e14ee7f338869174ae39674342f40cc804cb099145d1d97',
    },
    description: 'Swap script requires preimage when swapping out',
    error: 'ExpectedEitherHashOrSecretForSwapScript',
  },
  {
    args: {
      claim_public_key: '027e919ee986cd0ad6e012932c709e82396321a82faee5355ca5def9d0934b526c',
    },
    description: 'Swap script requires hash',
    error: 'ExpectedEitherHashOrSecretForSwapScript',
  },
  {
    args: {
      claim_private_key: '79957dc2091c8b024e14ee7f338869174ae39674342f40cc804cb099145d1d97',
      secret: 'bdb8e03b149a48e3c706663b8cee7c7590bee386d5d8b5620fd504c848437e6e',
    },
    description: 'Swap script requires refund public key when swapping out',
    error: 'ExpectedRefundPublicOrPrivateKeyForSwapScript',
  },
  {
    args: {
      claim_public_key: '027e919ee986cd0ad6e012932c709e82396321a82faee5355ca5def9d0934b526c',
      hash: Buffer.alloc(32).toString('hex'),
    },
    description: 'Swap script requires refund private key when swapping out',
    error: 'ExpectedRefundPublicOrPrivateKeyForSwapScript',
  },
  {
    args: {
      claim_private_key: '79957dc2091c8b024e14ee7f338869174ae39674342f40cc804cb099145d1d97',
      secret: 'bdb8e03b149a48e3c706663b8cee7c7590bee386d5d8b5620fd504c848437e6e',
      refund_public_key: '027e919ee986cd0ad6e012932c709e82396321a82faee5355ca5def9d0934b526c',
    },
    description: 'Swap script requires timeout',
    error: 'ExpectedSwapTimeoutExpirationCltvForSwapScript',
  },
  {
    args: {
      claim_public_key: '027e919ee986cd0ad6e012932c709e82396321a82faee5355ca5def9d0934b526c',
      hash: Buffer.alloc(32).toString('hex'),
      refund_private_key: '79957dc2091c8b024e14ee7f338869174ae39674342f40cc804cb099145d1d97',
    },
    description: 'Swap script requires timeout when swapping in',
    error: 'ExpectedSwapTimeoutExpirationCltvForSwapScript',
  },
];

tests.forEach(({args, description, error, expected}) => {
  return test(description, async () => {
    args.ecp = (await import('ecpair')).ECPairFactory(tinysecp);

    if (!!error) {
      throws(() => swapScriptV2(args), new Error(error), 'Error returned');
    } else {
      const {script} = swapScriptV2(args);

      equal(script, expected, 'Swap script derived');
    }

    return;
  });
});

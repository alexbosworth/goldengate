const {test} = require('tap');

const {swapScript} = require('./../../transactions');

const tests = [
  {
    args: {
      private_key: '79957dc2091c8b024e14ee7f338869174ae39674342f40cc804cb099145d1d97',
      secret: 'bdb8e03b149a48e3c706663b8cee7c7590bee386d5d8b5620fd504c848437e6e',
      service_public_key: '027e919ee986cd0ad6e012932c709e82396321a82faee5355ca5def9d0934b526c',
      timeout: 1515658,
    },
    description: 'Derive script from privkey, preimage secret, service key.',
    expected: '8201208763a914c792bea2f08a4dcada80a2e848e01f236bd139278821031cb9fba5d8cbc3dad06185e49de60fac484944c3c12682b604e0261b5375d3bf6775038a2017b17521027e919ee986cd0ad6e012932c709e82396321a82faee5355ca5def9d0934b526c68ac',
  },
];

tests.forEach(({args, description, expected}) => {
  return test(description, ({equal, end}) => {
    const {script} = swapScript(args);

    equal(script, expected, 'Swap script derived');

    return end();
  });
});

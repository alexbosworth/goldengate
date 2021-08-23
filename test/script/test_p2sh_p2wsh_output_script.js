const {test} = require('@alexbosworth/tap');

const {p2shP2wshOutputScript} = require('./../../script');

const tests = [
  {
    args: {
      script: '8201208763a914d1a70126ff7a149ca6f9b638db084480440ff8428821000000000000000000000000000000000000000000000000000000000000000000677503fbfa17b175210280a5a994052abe443adb74851387b389386306c690a94ddf3bfd71234cd2a72b68ac',
    },
    description: 'Output derived for witness script',
    expected: {
      output: 'a914c7f9731d2a9e9b50e18cf07c5b058d7ac0bf194487',
    },
  },
];

tests.forEach(({args, description, expected}) => {
  return test(description, ({end, equal}) => {
    const {output} = p2shP2wshOutputScript(args);

    equal(output, expected.output, 'Output script as expected');

    return end();
  });
});

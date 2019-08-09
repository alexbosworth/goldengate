const {test} = require('tap');

const {p2wshOutputScript} = require('./../../');

const tests = [
  {
    args: {
      script: '8201208763a914d1a70126ff7a149ca6f9b638db084480440ff8428821000000000000000000000000000000000000000000000000000000000000000000677503fbfa17b175210280a5a994052abe443adb74851387b389386306c690a94ddf3bfd71234cd2a72b68ac',
    },
    description: 'Output derived for witness script',
    expected: {
      output: '00206f569f1dcbb18b78883398b66a52c7c50938119ed4567cc3c2e5bb6d7b36c650',
    },
  },
];

tests.forEach(({args, description, expected}) => {
  return test(description, ({end, equal}) => {
    const {output} = p2wshOutputScript(args);

    equal(output, expected.output, 'Output script as expected');

    return end();
  });
});

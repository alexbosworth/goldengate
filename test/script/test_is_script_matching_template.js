const {OP_CHECKLOCKTIMEVERIFY} = require('bitcoin-ops');
const {OP_CHECKSIG} = require('bitcoin-ops');
const {OP_DROP} = require('bitcoin-ops');
const {OP_ELSE} = require('bitcoin-ops');
const {OP_ENDIF} = require('bitcoin-ops');
const {OP_EQUAL} = require('bitcoin-ops');
const {OP_EQUALVERIFY} = require('bitcoin-ops');
const {OP_HASH160} = require('bitcoin-ops');
const {OP_IF} = require('bitcoin-ops');
const {OP_SIZE} = require('bitcoin-ops');
const {test} = require('@alexbosworth/tap');

const method = require('./../../script/is_script_matching_template');

const tests = [
  {
    args: {
      script: '8201208763a9141cdc61141d0bee6afec8bf7fd7bb85c62bed15828821030b2a7982090497f5da5aff78e8fd001aa110992349152077b5694628fadbe7cb6775038c2017b1752103d0d76db25e6b64bdcdaa838d771375b7a26967ab896570a05aa4dd1ed189b34068ac',
      template: [
        OP_SIZE, (32).toString(16), OP_EQUAL,
        OP_IF,
          OP_HASH160, Buffer.alloc(20), OP_EQUALVERIFY,
          Buffer.alloc(33),
        OP_ELSE,
          OP_DROP, Buffer.alloc(1), OP_CHECKLOCKTIMEVERIFY, OP_DROP,
          Buffer.alloc(33),
        OP_ENDIF,
        OP_CHECKSIG,
      ],
    },
    description: 'Script matches template',
    expected: true,
  },
  {
    args: {
      script: '8201208763a9141cdc61141d0bee6afec8bf7fd7bb85c62bed15828821030b2a7982090497f5da5aff78e8fd001aa110992349152077b5694628fadbe7cb6775038c2017b1752103d0d76db25e6b64bdcdaa838d771375b7a26967ab896570a05aa4dd1ed189b34068ac',
      template: [
        Buffer.alloc(1), (32).toString(16), OP_EQUAL,
        OP_IF,
          OP_HASH160, Buffer.alloc(20), OP_EQUALVERIFY,
          Buffer.alloc(33),
        OP_ELSE,
          OP_DROP, Buffer.alloc(1), OP_CHECKLOCKTIMEVERIFY, OP_DROP,
          Buffer.alloc(33),
        OP_ENDIF,
        OP_CHECKSIG,
      ],
    },
    description: 'Script does not match template',
    expected: false,
  },
  {
    args: {},
    description: 'A script is required to match template',
    error: 'ExpectedScriptToCheckIfScriptMatchesTemplate',
  },
  {
    args: {script: '00'},
    description: 'A template is required to match template',
    error: 'ExpectedScriptTemplateToCheckIfScriptMatchesTemplate',
  },
  {
    args: {
      script: '8201208763a9141cdc61141d0bee6afec8bf7fd7bb85c62bed15828821030b2a7982090497f5da5aff78e8fd001aa110992349152077b5694628fadbe7cb6775038c2017b1752103d0d76db25e6b64bdcdaa838d771375b7a26967ab896570a05aa4dd1ed189b34068ac',
      template: [],
    },
    description: 'A template is required to match template length',
    expected: false,
  },
];

tests.forEach(({args, description, error, expected}) => {
  return test(description, ({equal, end, throws}) => {
    if (!!error) {
      throws(() => method(args), new Error(error), 'Error returned');
    } else {
      const isMatching = method(args);

      equal(isMatching, expected, 'Script matched');
    }

    return end();
  });
});

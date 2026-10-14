const {equal} = require('node:assert').strict;
const test = require('node:test');
const {throws} = require('node:assert').strict;

const {OP_0} = require('bitcoin-ops');
const {OP_1NEGATE} = require('bitcoin-ops');
const {OP_5} = require('bitcoin-ops');
const {OP_CHECKLOCKTIMEVERIFY} = require('bitcoin-ops');
const {OP_CHECKSIG} = require('bitcoin-ops');
const {OP_DROP} = require('bitcoin-ops');
const {OP_DUP} = require('bitcoin-ops');
const {OP_ELSE} = require('bitcoin-ops');
const {OP_ENDIF} = require('bitcoin-ops');
const {OP_EQUAL} = require('bitcoin-ops');
const {OP_EQUALVERIFY} = require('bitcoin-ops');
const {OP_HASH160} = require('bitcoin-ops');
const {OP_IF} = require('bitcoin-ops');
const {OP_SIZE} = require('bitcoin-ops');

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
  {
    args: {script: '760105', template: [OP_DUP, OP_5]},
    description: 'A single byte push of a small number matches its op code',
    expected: true,
  },
  {
    args: {script: '760105', template: [OP_DUP, Buffer.alloc(1)]},
    description: 'A single byte push of a small number is not a data push',
    expected: false,
  },
  {
    args: {script: '760181', template: [OP_DUP, OP_1NEGATE]},
    description: 'A single byte push of negative one matches OP_1NEGATE',
    expected: true,
  },
  {
    args: {script: '764c00', template: [OP_DUP, OP_0]},
    description: 'An empty data push matches OP_0',
    expected: true,
  },
  {
    args: {script: '760111', template: [OP_DUP, Buffer.alloc(1)]},
    description: 'A single byte push beyond 16 is a data push',
    expected: true,
  },
  {
    args: {script: '76020500', template: [OP_DUP, '0500']},
    description: 'A multiple byte push is a data push',
    expected: true,
  },
  {
    args: {
      script: `764c21${'02'.repeat(33)}`,
      template: [OP_DUP, Buffer.alloc(33)],
    },
    description: 'An OP_PUSHDATA1 push is a data push',
    expected: true,
  },
  {
    args: {
      script: `764d2100${'02'.repeat(33)}`,
      template: [OP_DUP, Buffer.alloc(33)],
    },
    description: 'An OP_PUSHDATA2 push is a data push',
    expected: true,
  },
  {
    args: {
      script: `7621${'02'.repeat(32)}`,
      template: [OP_DUP, Buffer.alloc(32)],
    },
    description: 'A push of more bytes than are in the script does not match',
    expected: false,
  },
  {
    args: {script: '764c', template: [OP_DUP, Buffer.alloc(1)]},
    description: 'A push with a missing byte count does not match',
    expected: false,
  },
  {
    args: {script: '7600', template: [OP_DUP, Buffer.alloc(33)]},
    description: 'An OP_0 where data is expected does not match',
    expected: false,
  },
  {
    args: {script: '00', template: [OP_DUP]},
    description: 'An OP_0 where another op code is expected does not match',
    expected: false,
  },
  {
    args: {script: '7660', template: [OP_DUP, (32).toString(16)]},
    description: 'An op code where data is expected does not match',
    expected: false,
  },
];

tests.forEach(({args, description, error, expected}) => {
  return test(description, (t, end) => {
    if (!!error) {
      throws(() => method(args), new Error(error), 'Error returned');
    } else {
      const isMatching = method(args);

      equal(isMatching, expected, 'Script matched');
    }

    return end();
  });
});

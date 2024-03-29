const {equal} = require('node:assert').strict;
const test = require('node:test');
const {throws} = require('node:assert').strict;

const {script} = require('bitcoinjs-lib');
const {ECPair} = require('ecpair');
const tinysecp = require('tiny-secp256k1');
const {Transaction} = require('bitcoinjs-lib');

const {isSweep} = require('./../../');
const {swapScript} = require('./../../script');
const {swapScriptV2} = require('./../../script');

const {compile} = script;
const {decompile} = script;

const makeTx = ({ecp, input, program, witness, scriptVersion}) => {
  const tx = new Transaction();

  if (!!input) {
    tx.addInput(Buffer.alloc(32), 0);
  }

  if (!!witness) {
    const {script} = !program ? {} : (scriptVersion || swapScript)({
      ecp,
      claim_public_key: Buffer.alloc(33).toString('hex'),
      hash: Buffer.alloc(32).toString('hex'),
      refund_private_key: Buffer.alloc(32, 1).toString('hex'),
      timeout: 999,
    });

    const decompiled = decompile(Buffer.from(script || '', 'hex'));

    (program || []).forEach(({index, override}) => {
      decompiled[index] = override;
    });

    const compiled = !program ? null : compile(decompiled).toString('hex');

    const stack = [].concat(witness).concat(compiled || []);

    tx.setWitness(Number(), stack.map(n => Buffer.from(n, 'hex')));
  }

  return tx.toHex();
};

const tests = [
  {
    args: false,
    description: 'A transaction is required to test for timeout sweep',
    error: 'ExpectedTransactionToDetermineIfTxIsSweep',
  },
  {
    args: {},
    description: 'Inputs are expected in a sweep transaction',
    expected: {},
  },
  {
    args: {input: true},
    description: 'A witness is expected in a sweep transaction',
    expected: {},
  },
  {
    args: {input: true, program: [], witness: ['00']},
    description: 'A witness with three stack elements is expected in a sweep',
    expected: {},
  },
  {
    args: {input: true, program: [], witness: ['00', '00']},
    description: 'A timeout sweep is returned',
    expected: {is_success_sweep: false, is_timeout_sweep: true},
  },
  {
    args: {
      input: true,
      program: [],
      witness: ['00', Buffer.alloc(33).toString('hex')],
      scriptVersion: swapScriptV2,
    },
    description: 'A v2 timeout sweep is returned',
    expected: {is_success_sweep: false, is_timeout_sweep: true},
  },
  {
    args: {
      input: true,
      program: [],
      witness: ['00', Buffer.alloc(32).toString('hex'), ''],
    },
    description: 'A success sweep is returned',
    expected: {is_success_sweep: true, is_timeout_sweep: false},
  },
  {
    args: {
      input: true,
      program: [],
      witness: [Buffer.alloc(32).toString('hex'), '00'],
      scriptVersion: swapScriptV2,
    },
    description: 'A v2 success sweep is returned',
    expected: {is_success_sweep: true, is_timeout_sweep: false},
  },
  {
    args: {
      input: true,
      program: [{index: 0, override: 1}],
      witness: ['00', '00'],
    },
    description: 'Op codes must match',
    expected: {},
  },
  {
    args: {
      input: true,
      program: [{index: 1, override: 1}],
      witness: ['00', '00'],
    },
    description: 'Buffer elements must be buffers',
    expected: {},
  },
  {
    args: {
      input: true,
      program: [{index: 1, override: Buffer.from('00', 'hex')}],
      witness: ['00', '00'],
    },
    description: 'Expected bytes must match',
    expected: {},
  },
  {
    args: {
      input: true,
      program: [{index: 5, override: Buffer.alloc(16)}],
      witness: ['00', '00'],
    },
    description: 'Buffer lengths must match',
    expected: {},
  },
  {
    args: {
      input: true,
      program: [{index: 5, override: 81}],
      witness: ['00', '00'],
    },
    description: 'A buffer is expected',
    expected: {},
  },
];

tests.forEach(({args, description, error, expected}) => {
  return test(description, async () => {
    args.ecp = (await import('ecpair')).ECPairFactory(tinysecp);

    const params = {transaction: makeTx(args)};

    if (args === false) {
      params.transaction = undefined;
    }

    if (!!error) {
      throws(() => isSweep(params), new Error(error), 'Got expected err');
    } else {
      const transaction = isSweep(params);

      equal(transaction.is_success_sweep, expected.is_success_sweep, 'Sweep');
      equal(transaction.is_timeout_sweep, expected.is_timeout_sweep, 'Failed');
    }

    return;
  });
});

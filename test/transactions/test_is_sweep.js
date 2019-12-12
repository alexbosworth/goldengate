const {script} = require('bitcoinjs-lib');
const {test} = require('tap');
const {Transaction} = require('bitcoinjs-lib');

const {isSweep} = require('./../../transactions');
const {swapScript} = require('./../../script');

const {compile} = script;
const {decompile} = script;

const makeTx = ({input, program, witness}) => {
  const tx = new Transaction();

  if (!!input) {
    tx.addInput(Buffer.alloc(32), 0);
  }

  if (!!witness) {
    const {script} = !program ? {} : swapScript({
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
    args: {},
    description: 'A transaction is required to test for timeout sweep',
    error: 'ExpectedTransactionToDetermineIfTxIsSweep',
  },
  {
    args: {transaction: makeTx({})},
    description: 'Inputs are expected in a sweep transaction',
    expected: {},
  },
  {
    args: {transaction: makeTx({input: true})},
    description: 'A witness is expected in a sweep transaction',
    expected: {},
  },
  {
    args: {transaction: makeTx({input: true, witness: ['00']})},
    description: 'A witness with three stack elements is expected in a sweep',
    expected: {},
  },
  {
    args: {
      transaction: makeTx({input: true, program: [], witness: ['00', '00']},
    )},
    description: 'A timeout sweep is returned',
    expected: {is_success_sweep: false, is_timeout_sweep: true},
  },
  {
    args: {
      transaction: makeTx({
        input: true,
        program: [],
        witness: ['00', Buffer.alloc(32).toString('hex')],
      },
    )},
    description: 'A success sweep is returned',
    expected: {is_success_sweep: true, is_timeout_sweep: false},
  },
  {
    args: {
      transaction: makeTx({
        input: true,
        program: [{index: 0, override: 1}],
        witness: ['00', '00'],
      },
    )},
    description: 'Op codes must match',
    expected: {},
  },
  {
    args: {
      transaction: makeTx({
        input: true,
        program: [{index: 1, override: 1}],
        witness: ['00', '00'],
      },
    )},
    description: 'Buffer elements must be buffers',
    expected: {},
  },
  {
    args: {
      transaction: makeTx({
        input: true,
        program: [{index: 1, override: Buffer.from('00', 'hex')}],
        witness: ['00', '00'],
      },
    )},
    description: 'Expected bytes must match',
    expected: {},
  },
  {
    args: {
      transaction: makeTx({
        input: true,
        program: [{index: 5, override: Buffer.alloc(16)}],
        witness: ['00', '00'],
      },
    )},
    description: 'Buffer lengths must match',
    expected: {},
  },
  {
    args: {
      transaction: makeTx({
        input: true,
        program: [{index: 5, override: 81}],
        witness: ['00', '00'],
      },
    )},
    description: 'A buffer is expected',
    expected: {},
  },
];

tests.forEach(({args, description, error, expected}) => {
  return test(description, ({end, equal, throws}) => {
    if (!!error) {
      throws(() => isSweep(args), new Error(error), 'Got expected err');
    } else {
      const transaction = isSweep(args);

      equal(transaction.is_success_sweep, expected.is_success_sweep, 'Sweep');
      equal(transaction.is_timeout_sweep, expected.is_timeout_sweep, 'Failed');
    }

    return end();
  });
});

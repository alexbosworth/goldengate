const {makeLnd} = require('mock-lnd');
const {test} = require('@alexbosworth/tap');

const method = require('./../../funding/maintain_utxo_locks');

const makeArgs = overrides => {
  const lnd = makeLnd({});
  const requests = [];

  lnd.default.getTransactions = ({}, cbk) => {
    requests.push({});

    if (requests.length === 1) {
      return cbk('err');
    }

    if (requests.length < 3) {
      return cbk(null, {transactions: []});
    }

    const transaction = {
      amount: '1',
      block_hash: Buffer.alloc(32).toString('hex'),
      block_height: 1,
      dest_addresses: ['address'],
      num_confirmations: 1,
      time_stamp: '1',
      total_fees: '1',
      tx_hash: Buffer.alloc(32).toString('hex'),
    };

    return cbk(null, {transactions: [transaction]});
  };

  const leases = [];

  lnd.wallet.leaseOutput = ({}, cbk) => {
    leases.push({});

    if (leases.length === 1) {
      return cbk('err');
    }

    return cbk(null, {expiration: '1'});
  };

  const args = {
    lnd,
    id: Buffer.alloc(32).toString('hex'),
    inputs: [{
      transaction_id: Buffer.alloc(32).toString('hex'),
      transaction_vout: 0,
    }],
    interval: 1,
  };

  Object.keys(overrides).forEach(k => args[k] = overrides[k]);

  return args;
};

const tests = [
  {
    args: makeArgs({id: undefined}),
    description: 'A tx id is required.',
    error: [400, 'ExpectedTransactionIdToMaintainUtxoLocks'],
  },
  {
    args: makeArgs({inputs: undefined}),
    description: 'UTXO inputs required.',
    error: [400, 'ExpectedArrayOfInputsToMaintainUtxoLocks'],
  },
  {
    args: makeArgs({interval: undefined}),
    description: 'A relock interval is required.',
    error: [400, 'ExpectedRelockIntervalToMaintainUtxoLocks'],
  },
  {
    args: makeArgs({lnd: undefined}),
    description: 'An authenticated lnd object is required.',
    error: [400, 'ExpectedAuthenticatedLndTomaintainUtxoLocks'],
  },
  // {
  //   args: makeArgs({
  //
  //   }),
  //   description: 'An authenticated lnd object is required.',
  //   error: [400, 'ExpectedAuthenticatedLndTomaintainUtxoLocks'],
  // },
  {
    args: makeArgs({}),
    description: 'Maintained UTXO locks',
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

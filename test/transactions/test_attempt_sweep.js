const {test} = require('tap');

const attemptSweep = require('./../../transactions/attempt_sweep');

const tests = [
  {
    args: {
      current_height: 105,
      deadline_height: 201,
      lnd: {wallet: {publishTransaction: (args, cbk) => cbk(null, {})}},
      max_fee_multiplier: 1000,
      network: 'btctestnet',
      private_key: '79957dc2091c8b024e14ee7f338869174ae39674342f40cc804cb099145d1d97',
      redeem_script: '8201208763a9141cdc61141d0bee6afec8bf7fd7bb85c62bed15828821030b2a7982090497f5da5aff78e8fd001aa110992349152077b5694628fadbe7cb6775038c2017b1752103d0d76db25e6b64bdcdaa838d771375b7a26967ab896570a05aa4dd1ed189b34068ac',
      secret: 'bdb8e03b149a48e3c706663b8cee7c7590bee386d5d8b5620fd504c848437e6e',
      start_height: 101,
      sweep_address: 'tb1qzmswhxxwxvhat6ke3wu27gqqxn4qxqn6qwarwkz6lmky3l3jqjfqy5wl9x',
      tokens: 5000,
      transaction_id: Buffer.alloc(32).toString('hex'),
      transaction_vout: 0,
    },
    description: 'Cursor starts at the default fee',
    expected: 1,
  },
];

tests.forEach(({args, description, expected}) => {
  return test(description, ({equal, end}) => {
    return attemptSweep(args, (err, res) => {
      equal(err, null, 'Sweep attempted');

      equal(res.min_fee_rate, expected, 'Returns min fee rate used');
      equal(!!res.transaction, true, 'Returns transaction');

      return end();
    });
  });
});

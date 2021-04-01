const {test} = require('tap');

const {attemptSweep} = require('./../../');

const current_height = 105;
const deadline_height = 201;
const lnd = {wallet: {publishTransaction: (args, cbk) => cbk(null, {})}};
const max_fee_multiplier = 1000;
const network = 'btctestnet';
const private_key = '79957dc2091c8b024e14ee7f338869174ae39674342f40cc804cb099145d1d97';
const secret = 'bdb8e03b149a48e3c706663b8cee7c7590bee386d5d8b5620fd504c848437e6e';
const start_height = 101;
const sweep_address = 'tb1qzmswhxxwxvhat6ke3wu27gqqxn4qxqn6qwarwkz6lmky3l3jqjfqy5wl9x';
const tokens = 5000;
const transaction_id = Buffer.alloc(32).toString('hex');
const transaction_vout = 0;
const witness_script = '8201208763a9141cdc61141d0bee6afec8bf7fd7bb85c62bed15828821030b2a7982090497f5da5aff78e8fd001aa110992349152077b5694628fadbe7cb6775038c2017b1752103d0d76db25e6b64bdcdaa838d771375b7a26967ab896570a05aa4dd1ed189b34068ac';

const makeArgs = overrides => {
  const args = {
    current_height,
    deadline_height,
    lnd,
    max_fee_multiplier,
    network,
    private_key,
    secret,
    start_height,
    sweep_address,
    tokens,
    transaction_id,
    transaction_vout,
    witness_script,
  };

  Object.keys(overrides).forEach(k => args[k] = overrides[k]);

  return args;
};

const tests = [
  {
    args: makeArgs({}),
    description: 'Cursor starts at the default fee',
    expected: 1,
  },
  {
    args: makeArgs({
      is_dry_run: true,
      lnd: {
        wallet: {
          estimateFee: ({}, cbk) => cbk(null, {sat_per_kw: 5000/4}),
          publishTransaction: (args, cbk) => cbk(null, {})
        },
      },
    }),
    description: 'LND chain fee is used',
    expected: 5,
  },
  {
    args: makeArgs({
      is_dry_run: true,
      lnd: {
        wallet: {
          estimateFee: ({}, cbk) => cbk(null, {sat_per_kw: 5000/4}),
          publishTransaction: (args, cbk) => cbk(null, {})
        },
      },
      min_fee_rate: 1,
    }),
    description: 'Min fee rate can be specified',
    expected: 1,
  },
  {
    args: makeArgs({current_height: undefined}),
    description: 'Current height is required',
    error: [400, 'ExpectedCurrentHeightForHtlcSweepAttempt'],
  },
  {
    args: makeArgs({deadline_height: undefined}),
    description: 'Deadline height is required',
    error: [400, 'ExpectedDeadlineHeightWhenAttemptingHtlcSweep'],
  },
  {
    args: makeArgs({deadline_height: current_height}),
    description: 'Deadline cannot be equal to current height',
    error: [500, 'FailedToGenerateSweepTransaction'],
  },
  {
    args: makeArgs({deadline_height: start_height}),
    description: 'Deadline cannot be equal to start height',
    error: [500, 'FailedToCalculateConfirmationFeeRate'],
  },
  {
    args: makeArgs({lnd: undefined}),
    description: 'Lnd is required',
    error: [400, 'ExpectedEitherLndOrRequestToAttemptSweep'],
  },
  {
    args: makeArgs({max_fee_multiplier: undefined}),
    description: 'A max fee multiplier is required',
    error: [400, 'ExpectedMaxFeeMultiplierForHtlcSweepAttempt'],
  },
  {
    args: makeArgs({network: undefined}),
    description: 'A network name is required',
    error: [400, 'ExpectedNetworkNameToExecuteUtxoSweepAttempt'],
  },
  {
    args: makeArgs({private_key: undefined}),
    description: 'A swap private key is required',
    error: [400, 'ExpectedClaimPrivKeyToExecuteUtxoSweepAttempt'],
  },
  {
    args: makeArgs({secret: undefined}),
    description: 'A swap secret is required',
    error: [400, 'ExpectedSweepSecretToExecuteUtxoSweepAttempt'],
  },
  {
    args: makeArgs({start_height: undefined}),
    description: 'A start height is required',
    error: [400, 'ExpectedSweepingStartHeightToAttemptNewSweep'],
  },
  {
    args: makeArgs({sweep_address: undefined}),
    description: 'A sweep address is required',
    error: [400, 'ExpectedSweepAddressToExecuteUtxoSweepAttempt'],
  },
  {
    args: makeArgs({tokens: undefined}),
    description: 'Tokens count is required',
    error: [400, 'ExpectedSwapTokensToExecuteUtxoSweepAttempt'],
  },
  {
    args: makeArgs({transaction_id: undefined}),
    description: 'A utxo transaction id is required',
    error: [400, 'ExpectedDepositTransactionIdToAttemptUtxoSweep'],
  },
  {
    args: makeArgs({transaction_vout: undefined}),
    description: 'A utxo transaction vout is required',
    error: [400, 'ExpectedDepositTxVoutToAttemptUtxoSweep'],
  },
  {
    args: makeArgs({witness_script: undefined}),
    description: 'A swap witness script is required',
    error: [400, 'ExpectedWitnessScriptToExecuteUtxoSweepAttempt'],
  },
];

tests.forEach(({args, description, error, expected}) => {
  return test(description, async ({equal, end, rejects}) => {
    if (!!error) {
      await rejects(attemptSweep(args), error, 'Expected error returned');
    } else {
      const res = await attemptSweep(args);

      equal(res.min_fee_rate, expected, 'Returns min fee rate used');
      equal(!!res.transaction, true, 'Returns transaction');
    }

    return end();
  });
});

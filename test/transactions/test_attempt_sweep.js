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

const tests = [
  {
    args: {
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
    },
    description: 'Cursor starts at the default fee',
    expected: 1,
  },
  {
    args: {},
    description: 'Current height is required',
    error: [400, 'ExpectedCurrentHeightForHtlcSweepAttempt'],
  },
  {
    args: {current_height},
    description: 'Deadline height is required',
    error: [400, 'ExpectedDeadlineHeightWhenAttemptingHtlcSweep'],
  },
  {
    args: {current_height, deadline_height},
    description: 'Lnd is required',
    error: [400, 'ExpectedEitherLndOrRequestToAttemptSweep'],
  },
  {
    args: {current_height, deadline_height, lnd},
    description: 'A max fee multiplier is required',
    error: [400, 'ExpectedMaxFeeMultiplierForHtlcSweepAttempt'],
  },
  {
    args: {current_height, deadline_height, lnd, max_fee_multiplier},
    description: 'A network name is required',
    error: [400, 'ExpectedNetworkNameToExecuteUtxoSweepAttempt'],
  },
  {
    args: {current_height, deadline_height, lnd, max_fee_multiplier, network},
    description: 'A swap private key is required',
    error: [400, 'ExpectedClaimPrivateKeyToExecuteUtxoSweepAttempt'],
  },
  {
    args: {
      current_height,
      deadline_height,
      lnd,
      max_fee_multiplier,
      network,
      private_key,
      witness_script,
    },
    description: 'A swap secret is required',
    error: [400, 'ExpectedSweepSecretToExecuteUtxoSweepAttempt'],
  },
  {
    args: {
      current_height,
      deadline_height,
      lnd,
      max_fee_multiplier,
      network,
      private_key,
      secret,
      witness_script,
    },
    description: 'A start height is required',
    error: [400, 'ExpectedSweepingStartHeightToAttemptNewSweep'],
  },
  {
    args: {
      current_height,
      deadline_height,
      lnd,
      max_fee_multiplier,
      network,
      private_key,
      secret,
      start_height,
      witness_script,
    },
    description: 'A sweep address is required',
    error: [400, 'ExpectedSweepAddressToExecuteUtxoSweepAttempt'],
  },
  {
    args: {
      current_height,
      deadline_height,
      lnd,
      max_fee_multiplier,
      network,
      private_key,
      secret,
      start_height,
      sweep_address,
      witness_script,
    },
    description: 'Tokens count is required',
    error: [400, 'ExpectedSwapTokensToExecuteUtxoSweepAttempt'],
  },
  {
    args: {
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
      witness_script,
    },
    description: 'A utxo transaction id is required',
    error: [400, 'ExpectedDepositTransactionIdToAttemptUtxoSweep'],
  },
  {
    args: {
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
      witness_script,
    },
    description: 'A utxo transaction vout is required',
    error: [400, 'ExpectedDepositTransactionVoutToAttemptUtxoSweep'],
  },
  {
    args: {
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
    },
    description: 'A swap witness script is required',
    error: [400, 'ExpectedWitnessScriptToExecuteUtxoSweepAttempt'],
  },
];

tests.forEach(({args, description, error, expected}) => {
  return test(description, ({deepIs, equal, end}) => {
    return attemptSweep(args, (err, res) => {
      if (!!error) {
        deepIs(err, error, 'Expected error returned');
      } else {
        equal(err, null, 'Sweep attempted');

        equal(res.min_fee_rate, expected, 'Returns min fee rate used');
        equal(!!res.transaction, true, 'Returns transaction');
      }

      return end();
    });
  });
});

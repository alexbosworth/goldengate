const asyncAuto = require('async/auto');
const {ECPair} = require('ecpair');
const {returnResult} = require('asyncjs-util');
const tinysecp = require('tiny-secp256k1');

const {broadcastTransaction} = require('./../chain');
const claimTransaction = require('./claim_transaction');
const confirmationFee = require('./confirmation_fee');
const {getChainFeeRate} = require('./../chain');

const defaultMinFeeRate = 1;
const longRangeConfTarget = 1008;

/** Attempt a sweep

  {
    current_height: <Current Chain Height Number>
    deadline_height: <Ultimate Target Chain Height Number>
    [is_dry_run]: <Avoid Broadcasting Transaction Bool>
    [lnd]: <Authenticated gRPC LND API Object>
    [min_fee_rate]: <Minimum Relay Fee Tokens Per VByte Number>
    max_fee_multiplier: <Maximum Fee Multiplier Number>
    network: <Network Name String>
    private_key: <Sweep Claim Key Private Key Hex String>
    [request]: <Request Function>
    secret: <Secret Preimage Hex String>
    [sends]: [{
      address: <Send to Address String>
      tokens: <Send Tokens Number>
    }]
    start_height: <Starting Height of Attempts Number>
    sweep_address: <Bech32 Sweep Address String>
    tokens: <Sweep Tokens Number>
    transaction_id: <Deposit Transaction Id String>
    transaction_vout: <Deposit Transaction Vout Number>
    witness_script: <Swap Redeem Script Hex String>
  }

  @returns via cbk or Promise
  {
    fee_rate: <Fee Rate Number>
    min_fee_rate: <Minimum Tokens Per VByte Fee Rate Number>
    transaction: <Raw Transaction Hex String>
  }
*/
module.exports = (args, cbk) => {
  return new Promise((resolve, reject) => {
    return asyncAuto({
      // Import ECPair library
      ecp: async () => (await import('ecpair')).ECPairFactory(tinysecp),

      // Check arguments
      validate: cbk => {
        if (!args.current_height) {
          return cbk([400, 'ExpectedCurrentHeightForHtlcSweepAttempt']);
        }

        if (!args.deadline_height) {
          return cbk([400, 'ExpectedDeadlineHeightWhenAttemptingHtlcSweep']);
        }

        if (!args.lnd && !args.request) {
          return cbk([400, 'ExpectedEitherLndOrRequestToAttemptSweep']);
        }

        if (!args.max_fee_multiplier) {
          return cbk([400, 'ExpectedMaxFeeMultiplierForHtlcSweepAttempt']);
        }

        if (!args.network) {
          return cbk([400, 'ExpectedNetworkNameToExecuteUtxoSweepAttempt']);
        }

        if (!args.private_key) {
          return cbk([400, 'ExpectedClaimPrivKeyToExecuteUtxoSweepAttempt']);
        }

        if (!args.secret) {
          return cbk([400, 'ExpectedSweepSecretToExecuteUtxoSweepAttempt']);
        }

        if (!args.start_height) {
          return cbk([400, 'ExpectedSweepingStartHeightToAttemptNewSweep']);
        }

        if (!args.sweep_address) {
          return cbk([400, 'ExpectedSweepAddressToExecuteUtxoSweepAttempt']);
        }

        if (!args.tokens) {
          return cbk([400, 'ExpectedSwapTokensToExecuteUtxoSweepAttempt']);
        }

        if (!args.transaction_id) {
          return cbk([400, 'ExpectedDepositTransactionIdToAttemptUtxoSweep']);
        }

        if (args.transaction_vout === undefined) {
          return cbk([400, 'ExpectedDepositTxVoutToAttemptUtxoSweep']);
        }

        if (!args.witness_script) {
          return cbk([400, 'ExpectedWitnessScriptToExecuteUtxoSweepAttempt']);
        }

        return cbk();
      },

      // Get minimal chain fee estimate
      getChainFee: ['validate', ({}, cbk) => {
        if (!!args.min_fee_rate) {
          return cbk(null, args.min_fee_rate);
        }

        return getChainFeeRate({
          confirmation_target: longRangeConfTarget,
          lnd: args.lnd,
          network: args.network,
          request: args.request,
        },
        (err, res) => {
          // Exit early with default fee rate if there is any issue
          if (!!err || !res || !res.tokens_per_vbyte) {
            return cbk(null, defaultMinFeeRate);
          }

          return cbk(null, res.tokens_per_vbyte);
        });
      }],

      // Get an adjusted fee based on block progression
      rate: ['getChainFee', ({getChainFee}, cbk) => {
        try {
          const {rate} = confirmationFee({
            before: args.deadline_height - args.start_height,
            cursor: args.current_height - args.start_height,
            fee: getChainFee,
            multiplier: args.max_fee_multiplier,
          });

          return cbk(null, rate);
        } catch (err) {
          return cbk([500, 'FailedToCalculateConfirmationFeeRate', err]);
        }
      }],

      // Claim transaction
      claim: [
        'ecp',
        'getChainFee',
        'rate',
        ({ecp, getChainFee, rate}, cbk) =>
      {
        try {
          // Form the claim transaction to sweep the output
          const {transaction} = claimTransaction({
            ecp,
            block_height: args.current_height,
            fee_tokens_per_vbyte: rate,
            network: args.network,
            private_key: args.private_key,
            secret: args.secret,
            sends: args.sends,
            sweep_address: args.sweep_address,
            tokens: args.tokens,
            transaction_id: args.transaction_id,
            transaction_vout: args.transaction_vout,
            witness_script: args.witness_script,
          });

          return cbk(null, {
            transaction,
            fee_rate: rate,
            min_fee_rate: getChainFee,
          });
        } catch (err) {
          return cbk([500, 'FailedToGenerateSweepTransaction', {err}]);
        }
      }],

      // Send transaction to peers to be mined
      broadcast: ['claim', ({claim}, cbk) => {
        // Exit early when this is a dry-run for a future broadcast
        if (!!args.is_dry_run) {
          return cbk();
        }

        return broadcastTransaction({
          lnd: args.lnd,
          network: args.network,
          request: args.request,
          transaction: claim.transaction,
        },
        cbk);
      }],
    },
    returnResult({reject, resolve, of: 'claim'}, cbk));
  });
};

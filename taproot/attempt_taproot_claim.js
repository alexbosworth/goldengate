const asyncAuto = require('async/auto');
const {returnResult} = require('asyncjs-util');
const tinysecp = require('tiny-secp256k1');

const {broadcastTransaction} = require('./../chain');
const taprootClaimTransaction = require('./taproot_claim_transaction');
const {confirmationFee} = require('./../transactions');
const {getChainFeeRate} = require('./../chain');

const defaultMinFeeRate = 1;
const {isArray} = Array;
const longRangeConfTarget = 1008;

/** Attempt a Taproot claim sweep

  {
    claim_script: <Swap Claim Leaf Script Hex String>
    current_height: <Current Chain Height Number>
    deadline_height: <Ultimate Target Chain Height Number>
    external_key: <External Public Key Hex String>
    [is_dry_run]: <Avoid Broadcasting Transaction Bool>
    [lnd]: <Authenticated LND API Object>
    [min_fee_rate]: <Minimum Relay Fee Tokens Per VByte Number>
    max_fee_multiplier: <Maximum Fee Multiplier Number>
    network: <Network Name String>
    output_script: <UTXO Output Script Hex String>
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
        if (!args.claim_script) {
          return cbk([400, 'ExpectedClaimLeafScriptToAttemptTaprootClaim']);
        }

        if (!args.current_height) {
          return cbk([400, 'ExpectedCurrentHeightToAttemptTaprootClaim']);
        }

        if (!args.deadline_height) {
          return cbk([400, 'ExpectedDeadlineHeightToAttemptTaprootClaim']);
        }

        if (!args.external_key) {
          return cbk([400, 'ExpectedExternalKeyToAttemptTaprootClaimSweep']);
        }

        if (!args.lnd && !args.request) {
          return cbk([400, 'ExpectedEitherLndOrRequestToAttemptClaimSweep']);
        }

        if (!args.max_fee_multiplier) {
          return cbk([400, 'ExpectedMaxFeeMultiplierToAttemptClaimSweep']);
        }

        if (!args.network) {
          return cbk([400, 'ExpectedNetworkNameToAttemptTaprootClaimSweep']);
        }

        if (!args.output_script) {
          return cbk([400, 'ExpectedOutputScriptToAttemptTaprootClaimSweep']);
        }

        if (!args.private_key) {
          return cbk([400, 'ExpectedClaimPrivKeyToAttemptTaprootClaimSweep']);
        }

        if (!isArray(args.script_branches)) {
          return cbk([400, 'ExpectedScriptBranchesToAttemptTaprootClaim']);
        }

        if (!args.secret) {
          return cbk([400, 'ExpectedSweepSecretToAttemptTaprootClaimSweep']);
        }

        if (!args.start_height) {
          return cbk([400, 'ExpectedSweepingStartHeightToAttemptNewSweep']);
        }

        if (!args.sweep_address) {
          return cbk([400, 'ExpectedSweepAddressToExecuteTaprootClaimSweep']);
        }

        if (!args.tokens) {
          return cbk([400, 'ExpectedSwapTokensToExecuteTaprootClaimSweep']);
        }

        if (!args.transaction_id) {
          return cbk([400, 'ExpectedDepositTransactionIdToAttemptClaimSweep']);
        }

        if (args.transaction_vout === undefined) {
          return cbk([400, 'ExpectedDepositTxVoutToAttemptTaprootClaimSweep']);
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
          const {transaction} = taprootClaimTransaction({
            ecp,
            block_height: args.current_height,
            claim_script: args.claim_script,
            external_key: args.external_key,
            fee_tokens_per_vbyte: rate,
            network: args.network,
            output_script: args.output_script,
            private_key: args.private_key,
            script_branches: args.script_branches,
            secret: args.secret,
            sends: args.sends || [],
            sweep_address: args.sweep_address,
            tokens: args.tokens,
            transaction_id: args.transaction_id,
            transaction_vout: args.transaction_vout,
          });

          return cbk(null, {
            transaction,
            fee_rate: rate,
            min_fee_rate: getChainFee,
          });
        } catch (err) {
          return cbk([500, 'FailedToGenerateTaprootClaimTransaction', {err}]);
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

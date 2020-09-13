const asyncAuto = require('async/auto');
const {ECPair} = require('bitcoinjs-lib');
const {returnResult} = require('asyncjs-util');

const {broadcastTransaction} = require('./../chain');
const {findDeposit} = require('./../chain');
const {getHeight} = require('./../chain');
const {makeAddressForScript} = require('./../script');
const makeRefundTransaction = require('./make_refund_transaction');
const {swapScript} = require('./../script');
const {swapScriptV2} = require('./../script');

const defaultTimeoutMs = 1000 * 30;
const minRelayFee = 1;
const scriptVersion1 = undefined;
const scriptVersion2 = 2;

/** Attempt a refund

  {
    [fee_tokens_per_vbyte]: <Fee Tokens Per Virtual Byte Number>
    hash: <Swap Hash Hex String>
    [lnd]: <Authenticated LND API gRPC Object>
    [network]: <Network Name String>
    refund_private_key: <Refund Private Key Hex String>
    [request]: <Request Function>
    service_public_key: <Service Public Key Hex String>
    start_height: <Swap Start Height Number>
    sweep_address: <Sweep Address String>
    timeout_height: <Timeout Block Height Number>
    tokens: <Swap Tokens Number>
    [version]: <Swap Version Number>
  }

  @returns via cbk or Promise
  {
    refund_transaction: <Transaction Hex String>
    transaction_id: <Transaction Id Hex String>
    transaction_vout: <Transaction Vout Number>
  }
*/
module.exports = (args, cbk) => {
  return new Promise((resolve, reject) => {
    return asyncAuto({
      // Check arugments
      validate: cbk => {
        if (!args.hash) {
          return cbk([400, 'ExpectedHashOfSwapToAttemptRefund']);
        }

        if (!args.lnd && !args.request) {
          return cbk([400, 'ExpectedLndOrRequestToAttemptRefund']);
        }

        if (!args.network && !args.lnd) {
          return cbk([400, 'ExpectedNetworkToAttemptRefund']);
        }

        if (!args.refund_private_key) {
          return cbk([400, 'ExpectedRefundPrivateKeyToAttemptRefund']);
        }

        if (!args.service_public_key) {
          return cbk([400, 'ExpectedServicePublicKeyToAttemptRefund']);
        }

        if (!args.start_height) {
          return cbk([400, 'ExpectedStartHeightToAttemptRefund']);
        }

        if (!args.sweep_address) {
          return cbk([400, 'ExpectedSweepAddressToAttemptRefund']);
        }

        if (!args.timeout_height) {
          return cbk([400, 'ExpectedTimeoutHeightToAttemptRefund']);
        }

        if (!args.tokens) {
          return cbk([400, 'ExpectedTokensToAttemptRefund']);
        }

        return cbk();
      },

      // Get the current height
      getHeight: ['validate', ({}, cbk) => {
        return getHeight({
          lnd: args.lnd,
          network: args.network,
          request: args.request,
        },
        cbk);
      }],

      // Swap script
      script: ['validate', ({}, cbk) => {
        try {
          switch (args.version) {
          case scriptVersion1:
            return cbk(null, swapScript({
              hash: args.hash,
              claim_public_key: args.service_public_key,
              refund_private_key: args.refund_private_key,
              timeout: args.timeout_height,
            }).script);

          case scriptVersion2:
            return cbk(null, swapScriptV2({
              hash: args.hash,
              claim_public_key: args.service_public_key,
              refund_private_key: args.refund_private_key,
              timeout: args.timeout_height,
            }).script);

          default:
            return cbk([400, 'UnrecognizedScriptVersionForRefundAttempt']);
          }
        } catch (err) {
          return cbk([400, 'FailedToDeriveSwapScriptForRefundAttempt', {err}]);
        }
      }],

      // Swap address
      swapAddress: ['script', ({script}, cbk) => {
        return makeAddressForScript({script, network: args.network}, cbk);
      }],

      // Check height
      checkHeight: ['getHeight', ({getHeight}, cbk) => {
        if (getHeight.height < args.timeout_height) {
          return cbk([425, 'SwapTimeoutHeightNotMetForRefundTransaction']);
        }

        return cbk();
      }],

      // Find deposit
      findDeposit: ['checkHeight', 'swapAddress', ({swapAddress}, cbk) => {
        return findDeposit({
          address: swapAddress.nested,
          after: args.start_height,
          confirmations: [].length,
          lnd: args.lnd,
          network: args.network,
          request: args.request,
          timeout: defaultTimeoutMs,
          tokens: args.tokens,
        },
        cbk);
      }],

      // Refund transaction
      makeRefund: ['findDeposit', 'script', ({findDeposit, script}, cbk) => {
        return makeRefundTransaction({
          block_height: args.timeout_height,
          fee_tokens_per_vbyte: args.fee_tokens_per_vbyte || minRelayFee,
          network: args.network,
          private_key: args.refund_private_key,
          sweep_address: args.sweep_address,
          tokens: findDeposit.output_tokens,
          transaction_id: findDeposit.transaction_id,
          transaction_vout: findDeposit.transaction_vout,
          witness_script: script,
        },
        cbk);
      }],

      // Broadcast transaction
      publish: ['makeRefund', ({makeRefund}, cbk) => {
        return broadcastTransaction({
          lnd: args.lnd,
          network: args.network,
          request: args.request,
          transaction: makeRefund.transaction,
        },
        cbk);
      }],

      // Refund details
      refund: [
        'findDeposit',
        'makeRefund',
        ({findDeposit, makeRefund}, cbk) =>
      {
        return cbk(null, {
          refund_transaction: makeRefund.transaction,
          transaction_id: findDeposit.transaction_id,
          transaction_vout: findDeposit.transaction_vout,
        });
      }],
    },
    returnResult({reject, resolve, of: 'refund'}, cbk));
  });
};

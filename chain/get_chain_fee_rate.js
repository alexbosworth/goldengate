const asyncAuto = require('async/auto');
const {getChainFeeRate} = require('ln-service');
const {returnResult} = require('asyncjs-util');

const {getBlockstreamChainFeeRate} = require('./../blockstream');

const isRate = n => Number.isFinite(n) && n > 0;

/** Get chain fee rate

  {
    confirmation_target: <Confirmation Target Number>
    [lnd]: <Authenticated LND gRPC API Object>
    [network]: <Network Name String>
    [request]: <Request Function>
  }

  @returns via cbk
  {
    tokens_per_vbyte: <Tokens Per VByte Fee Number>
  }
*/
module.exports = (args, cbk) => {
  return new Promise((resolve, reject) => {
    return asyncAuto({
      // Check arguments
      validate: cbk => {
        if (!args.confirmation_target) {
          return cbk([400, 'ExpectedConfirmationTargetToGetChainFeeRate']);
        }

        if (!args.lnd && !args.request) {
          return cbk([400, 'ExpectedRequestFunctionOrLndObjToGetChainFeeRate']);
        }

        if (!args.network && !!args.request) {
          return cbk([400, 'ExpectedNetworkToGetChainFeeRate']);
        }

        return cbk();
      },

      // Get chain fees from Blockstream
      getBlockstreamFeeRate: ['validate', ({}, cbk) => {
        if (!args.request) {
          return cbk();
        }

        return getBlockstreamChainFeeRate({
          confirmation_target: args.confirmation_target,
          network: args.network,
          request: args.request,
        },
        cbk);
      }],

      // Get chain fee rate from lnd
      getLndFeeRate: ['validate', ({}, cbk) => {
        if (!args.lnd) {
          return cbk();
        }

        return getChainFeeRate({
          confirmation_target: args.confirmation_target,
          lnd: args.lnd,
        },
        cbk);
      }],

      // Tokens per vbyte
      tokens: [
        'getBlockstreamFeeRate',
        'getLndFeeRate',
        ({getBlockstreamFeeRate, getLndFeeRate}, cbk) =>
      {
        const feeRate = getBlockstreamFeeRate || getLndFeeRate;

        // A fee rate from a chain data source is checked before it is used
        if (!isRate(feeRate.tokens_per_vbyte)) {
          return cbk([503, 'ExpectedValidChainFeeRateEstimate']);
        }

        return cbk(null, {tokens_per_vbyte: feeRate.tokens_per_vbyte});
      }],
    },
    returnResult({reject, resolve, of: 'tokens'}, cbk));
  });
};

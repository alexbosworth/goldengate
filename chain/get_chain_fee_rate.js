const asyncAuto = require('async/auto');
const {getChainFeeRate} = require('ln-service');

const {getBlockstreamChainFeeRate} = require('./../blockstream');

const defaultTokensPerVbyte = 1;

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
    tokensPerVbyte: [
      'getBlockstreamFeeRate',
      'getLndFeeRate',
      ({getBlockstreamFeeRate, getLndFeeRate}, cbk) =>
    {
      const feeRate = getBlockstreamFeeRate || getLndFeeRate;

      return cbk(null, feeRate.tokens_per_vbyte);
    }],
  },
  (err, res) => {
    if (!!err) {
      return cbk(err);
    }

    return cbk(null, {tokens_per_vbyte: res.tokensPerVbyte});
  });
};

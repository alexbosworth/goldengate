const getChainFees = require('./get_chain_fees');

const minConfTarget = 2;

/** Get chain fee rate for a confirmation target from Blockstream

  {
    confirmation_target: <Confirmation Target Number>
    network: <Network Name String>
    request: <Request Function>
  }

  @returns via cbk
  {
    tokens_per_vbyte: <Tokens Per VByte Fee Number>
  }
*/
module.exports = (args, cbk) => {
  if (!args.confirmation_target) {
    return cbk([400, 'ExpectedConfirmationTargetToGetBlockstreamFeeRate']);
  }

  if (args.confirmation_target < minConfTarget) {
    return cbk([400, 'ExpectedMinConfTargetToGetBlockstreamFeeRate']);
  }

  if (!args.network) {
    return cbk([400, 'ExpectedNetworkToGetBlockstreamFeeRate']);
  }

  if (!args.request) {
    return cbk([400, 'ExpectedRequestFunctionToGetBlockstreamFeeRate']);
  }

  return getChainFees({
    network: args.network,
    request: args.request,
  },
  (err, res) => {
    if (!!err) {
      return cbk(err);
    }

    for (let i = args.confirmation_target; i > 0; i--) {
      if (!!res.fees[`${i}`]) {
        return cbk(null, {tokens_per_vbyte: res.fees[`${i}`]});
      }
    }

    return cbk([503, 'FailedToFindConfirmationTarget'])
  });
};

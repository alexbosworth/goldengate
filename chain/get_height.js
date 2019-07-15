const asyncAuto = require('async/auto');
const {getWalletInfo} = require('ln-service');
const {returnResult} = require('asyncjs-util');

const {getHeightFromBlockstream} = require('./../blockstream');

const {max} = Math;

/** Get the chain tip height

  {
    [lnd]: <Authenticated LND gRPC API Object>
    [network]: <Network Name String>
    [request]: <Request Function>a
  }
*/
module.exports = ({lnd, network, request}, cbk) => {
  return asyncAuto({
    // Check arguments
    validate: cbk => {
      if (!lnd && !request) {
        return cbk([400, 'ExpectedLndOrRequestToGetChainHeight']);
      }

      if (!!request && !network) {
        return cbk([400, 'ExpectedNetworkWhenUsingRequestToGetChainHeight']);
      }

      return cbk();
    },

    // Get blockstream height
    getBlockstreamTip: ['validate', ({}, cbk) => {
      if (!request) {
        return cbk();
      }

      return getHeightFromBlockstream({network, request}, cbk);
    }],

    // Get wallet info
    getLndTip: ['validate', ({}, cbk) => {
      if (!lnd) {
        return cbk();
      }

      return getWalletInfo({lnd}, cbk);
    }],

    // Chain tip height
    tip: [
      'getBlockstreamTip',
      'getLndTip',
      ({getBlockstreamTip, getLndTip}, cbk) =>
    {
      const blockstreamTip = !getBlockstreamTip ? 0 : getBlockstreamTip.height;
      const lndTip = !getLndTip ? 0 : getLndTip.current_block_height;

      return cbk(null, {height: max(blockstreamTip, lndTip)});
    }],
  },
  returnResult({of: 'tip'}, cbk));
};

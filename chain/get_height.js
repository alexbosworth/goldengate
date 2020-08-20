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

  @returns via cbk or Promise
  {
    height: <Chain Tip Block Height Number>
  }
*/
module.exports = ({lnd, network, request}, cbk) => {
  return new Promise((resolve, reject) => {
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
        const bsTip = !getBlockstreamTip ? Number() : getBlockstreamTip.height;
        const lndTip = !getLndTip ? Number() : getLndTip.current_block_height;

        return cbk(null, {height: max(bsTip, lndTip)});
      }],
    },
    returnResult({reject, resolve, of: 'tip'}, cbk));
  });
};

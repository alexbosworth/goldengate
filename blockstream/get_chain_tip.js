const asyncAuto = require('async/auto');
const {returnResult} = require('asyncjs-util');

const {apis} = require('./conf/blockstream-info');

/* Get chain tip

  {
    network: <Network Name String>
    request: <Request Function>
  }

  @returns via cbk or Promise
  {
    height: <Chain Tip Height Number>
    id: <Chain Tip Hash Hex String>
  }
*/
module.exports = ({network, request}, cbk) => {
  return new Promise((resolve, reject) => {
    return asyncAuto({
      // Check arguments
      validate: cbk => {
        if (!network) {
          return cbk([400, 'ExpectedNetworkToGetChainTip']);
        }

        if (!request) {
          return cbk([400, 'ExpectedRequestToGetChainTip']);
        }

        return cbk();
      },

      // Get chain tip hash
      getHash: cbk => {
        return request({
          url: `${apis[network]}/blocks/tip/hash`,
        },
        (err, r, hash) => {
          if (!!err) {
            return cbk([503, 'UnexpectedErrorGettingChainTipHash', {err}]);
          }

          if (!r) {
            return cbk([503, 'UnexpectedResponseGettingChainTipHash']);
          }

          if (r.statusCode !== 200) {
            return cbk([503, 'UnexpectedStatusCodeGettingChainTipHash']);
          }

          if (!hash) {
            return cbk([503, 'ExpectedBlockHashWhenGettingChainTipHash']);
          }

          return cbk(null, hash);
        });
      },

      // Get block info
      getHeight: ['getHash', ({getHash}, cbk) => {
        return request({
          json: true,
          url: `${apis[network]}/block/${getHash}`,
        },
        (err, r, block) => {
          if (!!err) {
            return cbk([503, 'UnexpectedErrorGettingTipBlockDetails', {err}]);
          }

          if (!r) {
            return cbk([503, 'ExpectedResponseWhenGettingChainTipBlock']);
          }

          if (r.statusCode !== 200) {
            return cbk([503, 'UnexpectedStatusCodeGettingBlockDetails']);
          }

          if (!block) {
            return cbk([503, 'ExpectedBlockDetailsInBlockLookupResponse']);
          }

          if (block.height === undefined) {
            return cbk([503, 'ExpectedBlockHeightInBlockLookupDetails']);
          }

          return cbk(null, block.height);
        });
      }],

      // Chain tip
      tip: ['getHash', 'getHeight', ({getHash, getHeight}, cbk) => {
        return cbk(null, {height: getHeight, id: getHash});
      }],
    },
    returnResult({reject, resolve, of: 'tip'}, cbk));
  });
};

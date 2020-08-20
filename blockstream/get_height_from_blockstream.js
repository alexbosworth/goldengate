const asyncAuto = require('async/auto');
const {returnResult} = require('asyncjs-util');

const {apis} = require('./conf/blockstream-info');

/** Get chain tip height from blockstream

  {
    network: <Network Name String>
    request: <Request Function>
  }

  @returns via cbk
  {
    height: <Chain Tip Height Number>
  }
*/
module.exports = ({network, request}, cbk) => {
  return new Promise((resolve, reject) => {
    return asyncAuto({
      // Check arguments
      validate: cbk => {
        if (!network || !apis[network]) {
          return cbk([400, 'ExpectedKnownNetworkNameToGetChainTipHeight']);
        }

        if (!request) {
          return cbk([400, 'ExpectedRequestFunctionToGetChainTipHeight']);
        }

        return cbk();
      },

      // Get height
      getHeight: ['validate', ({}, cbk) => {
        return request({
          url: `${apis[network]}/blocks/tip/height`,
        },
        (err, r, res) => {
          if (!!err) {
            return cbk([503, 'UnexpectedErrorGettingChainTipHeight', {err}]);
          }

          if (!r) {
            return cbk([503, 'UnexpectedEmptyResponseGettingChainTipHeight']);
          }

          if (r.statusCode !== 200) {
            return cbk([503, 'UnexpectedStatusCodeGettingChainTipHeight']);
          }

          if (!res) {
            return cbk([503, 'ExpectedHeightInGetChainTipHeightResponse']);
          }

          const height = Number(res);

          if (isNaN(height)) {
            return cbk([503, 'UnexpectedHeightValueInChainTipHeightResponse']);
          }

          return cbk(null, {height});
        });
      }],
    },
    returnResult({reject, resolve, of: 'getHeight'}, cbk));
  });
};

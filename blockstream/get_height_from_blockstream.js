const {apis} = require('./conf/blockstream-info');

const decBase = 10;

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
  if (!network || !apis[network]) {
    return cbk([400, 'ExpectedKnownNetworkNameToGetChainTipHeight']);
  }

  if (!request) {
    return cbk([400, 'ExpectedRequestFunctionToGetChainTipHeight']);
  }

  return request({
    url: `${apis[network]}/blocks/tip/height`,
  },
  (err, r, height) => {
    if (!!err) {
      return cbk([503, 'UnexpectedErrorGettingChainTipHeight', err]);
    }

    if (!r || r.statusCode !== 200) {
      return cbk([503, 'UnexpectedStatusCodeGettingChainTipHeight']);
    }

    if (!height) {
      return cbk([503, 'ExpectedHeightInGetChainTipHeightResponse']);
    }

    return cbk(null, {height: parseInt(height, decBase)});
  });
};

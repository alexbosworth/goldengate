const request = require('request');

const {apis} = require('./conf/blockstream-info');

const decBase = 10;

/** Get chain tip height

  {
    network: <Network Name String>
  }

  @returns via cbk
  {
    height: <Chain Tip Height Number>
  }
*/
module.exports = ({network}, cbk) => {
  if (!network || !apis[network]) {
    return cbk([400, 'ExpectedKnownNetworkNameToGetChainTipHeight']);
  }

  return request({
    url: `https://blockstream.info/testnet/api/blocks/tip/height`,
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

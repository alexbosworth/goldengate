const {apis} = require('./conf/blockstream-info');

const normalFeeTarget = 6;

/** Get fee estimates

  {
    network: <Network Name String>
    request: <Request Function>
  }

  @returns via cbk
  {
    fees: {
      'confirmation number': <Confirmation Fee Tokens Per Virtual Byte Number>
    }
  }
*/
module.exports = ({network, request}, cbk) => {
  if (!network || !apis[network]) {
    return cbk([400, 'ExpectedKnownNetworkToGetFeeEstimates']);
  }

  if (!request) {
    return cbk([400, 'ExpectedRequestToGetFeeEstimates']);
  }

  return request({
    json: true,
    url: `${apis[network]}/fee-estimates`,
  },
  (err, r, fees) => {
    if (!!err) {
      return cbk([503, 'UnexpectedErrorGettingFeeEstimates', err]);
    }

    if (!r || r.statusCode !== 200) {
      return cbk([503, 'UnexpectedStatusCodeGettingFeeEstimates']);
    }

    if (!fees) {
      return cbk([503, 'ExpectedFeesFromFeeEstimatesApi']);
    }

    if (!fees[normalFeeTarget]) {
      return cbk([503, 'ExpectedNormalFeeEstimateInFeeEstimatesApi']);
    }

    return cbk(null, {fees});
  });
};

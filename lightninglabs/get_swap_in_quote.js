const asyncAuto = require('async/auto');
const {returnResult} = require('asyncjs-util');

const {protocolVersion} = require('./conf/swap_service');

/** Get swap in quote from swap service

  {
    metadata: <Authentication Metadata Object>
    service: <Swap Service Object>
    tokens: <Tokens to Swap Number>
  }

  @returns via cbk or Promise
  {
    cltv_delta: <CLTV Delta Number>
    fee: <Total Fee Tokens Number>
  }
*/
module.exports = ({metadata, service, tokens}, cbk) => {
  return new Promise((resolve, reject) => {
    return asyncAuto({
      // Check arguments
      validate: cbk => {
        if (!metadata) {
          return cbk([400, 'ExpectedAuthenticationMetadataToGetSwapInQuote']);
        }

        if (!service || !service.loopInQuote) {
          return cbk([400, 'ExpectedServiceToGetSwapInQuote']);
        }

        if (!tokens) {
          return cbk([400, 'ExpectedTokensAmountToGetSwapInQuote']);
        }

        return cbk();
      },

      // Get quote
      getQuote: ['validate', ({}, cbk) => {
        return service.loopInQuote({
          amt: tokens.toString(),
          protocol_version: protocolVersion,
        },
        metadata,
        (err, res) => {
          if (!!err) {
            return cbk([503, 'UnexpectedErrorGettingSwapInQuote', {err}]);
          }

          if (!res) {
            return cbk([503, 'ExpectedResponseWhenGettingSwapInQuote']);
          }

          return cbk(null, {
            cltv_delta: res.cltv_delta,
            swap_fee: res.swap_fee,
          });
        });
      }],

      // Loop In Quote
      quote: ['getQuote', ({getQuote}, cbk) => {
        if (getQuote.cltv_delta === undefined) {
          return cbk([503, 'ExpectedCltvDeltaInSwapInQuoteResponse']);
        }

        if (!getQuote.swap_fee) {
          return cbk([503, 'ExpectedSwapFeeBaseRateInSwapInQuoteResponse']);
        }

        return cbk(null, {
          cltv_delta: getQuote.cltv_delta,
          fee: Number(getQuote.swap_fee),
        });
      }],
    },
    returnResult({reject, resolve, of: 'quote'}, cbk));
  });
};

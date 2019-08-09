const asyncAuto = require('async/auto');
const {returnResult} = require('asyncjs-util');

const {getGrpcInterface} = require('./../grpc');

const decBase = 10;

/** Get swap quote from swap service

  {
    service: <Swap Service Object>
  }

  @returns via cbk or Promise
  {
    base_fee: <Base Fee Tokens Number>
    cltv_delta: <CLTV Delta Number>
    fee_rate: <Fee Rate in Parts Per Million Number>
    max_tokens: <Maximum Swap Tokens Number>
    min_tokens: <Minimum Swap Tokens Number>
  }
*/
module.exports = ({service}, cbk) => {
  return new Promise((resolve, reject) => {
    return asyncAuto({
      // Check arguments
      validate: cbk => {
        if (!service || !service.loopInQuote) {
          return cbk([400, 'ExpectedServiceToGetSwapInQuote']);
        }

        return cbk();
      },

      // Get quote
      getQuote: ['validate', ({}, cbk) => {
        return service.loopInQuote({}, (err, res) => {
          if (!!err) {
            return cbk([503, 'UnexpectedErrorGettingSwapInQuote', {err}]);
          }

          if (!res) {
            return cbk([503, 'ExpectedResponseWhenGettingSwapInQuote']);
          }

          return cbk(null, {
            cltv_delta: res.cltv_delta,
            max_swap_amount: res.max_swap_amount,
            min_swap_amount: res.min_swap_amount,
            swap_fee_base: res.swap_fee_base,
            swap_fee_rate: res.swap_fee_rate,
          });
        });
      }],

      // Loop In Quote
      quote: ['getQuote', ({getQuote}, cbk) => {
        if (!getQuote.cltv_delta) {
          return cbk([503, 'ExpectedCltvDeltaInSwapInQuoteResponse']);
        }

        if (!getQuote.max_swap_amount) {
          return cbk([503, 'ExpectedMaxSwapAmountInSwapInQuoteResponse']);
        }

        if (!getQuote.min_swap_amount) {
          return cbk([503, 'ExpectedMinSwapAmountInSwapInQuoteResponse']);
        }

        if (!getQuote.swap_fee_base) {
          return cbk([503, 'ExpectedSwapFeeBaseRateInSwapInQuoteResponse']);
        }

        if (!getQuote.swap_fee_rate) {
          return cbk([503, 'ExpectedSwapFeeRateInSwapInQuoteResponse']);
        }

        return cbk(null, {
          base_fee: parseInt(getQuote.swap_fee_base, decBase),
          cltv_delta: getQuote.cltv_delta,
          fee_rate: parseInt(getQuote.swap_fee_rate, decBase),
          max_tokens: parseInt(getQuote.max_swap_amount, decBase),
          min_tokens: parseInt(getQuote.min_swap_amount, decBase),
        });
      }],
    },
    returnResult({reject, resolve, of: 'quote'}, cbk));
  });
};

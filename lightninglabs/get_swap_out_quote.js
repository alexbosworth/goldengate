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
    deposit: <Deposit Tokens Number>
    destination: <Destination Public Key Hex String>
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
        if (!service || !service.loopOutQuote) {
          return cbk([400, 'ExpectedServiceToGetSwapQuote']);
        }

        return cbk();
      },

      // Get quote
      getQuote: ['validate', ({}, cbk) => {
        return service.loopOutQuote({}, (err, res) => {
          if (!!err) {
            return cbk([503, 'UnexpectedErrorGettingSwapQuote', {err}]);
          }

          if (!res) {
            return cbk([503, 'ExpectedResponseWhenGettingSwapQuote']);
          }

          return cbk(null, res);
        });
      }],

      // Loop out quote
      quote: ['getQuote', ({getQuote}, cbk) => {
        if (!getQuote.cltv_delta) {
          return cbk([503, 'ExpectedCltvDeltaInSwapQuoteResponse']);
        }

        if (!getQuote.max_swap_amount) {
          return cbk([503, 'ExpectedMaxSwapAmountInSwapQuoteResponse']);
        }

        if (!getQuote.min_swap_amount) {
          return cbk([503, 'ExpectedMinSwapAmountInSwapQuoteResponse']);
        }

        if (!getQuote.prepay_amt) {
          return cbk([503, 'ExpectedPrepayAmountInSwapQuoteResponse']);
        }

        if (!getQuote.swap_fee_base) {
          return cbk([503, 'ExpectedSwapFeeBaseRateInSwapQuoteResponse']);
        }

        if (!getQuote.swap_fee_rate) {
          return cbk([503, 'ExpectedSwapFeeRateInSwapQuoteResponse']);
        }

        if (!getQuote.swap_payment_dest) {
          return cbk([503, 'ExpectedSwapPaymentDestinationPublicKey']);
        }

        return cbk(null, {
          base_fee: parseInt(getQuote.swap_fee_base, decBase),
          cltv_delta: getQuote.cltv_delta,
          deposit: parseInt(getQuote.prepay_amt, decBase),
          destination: getQuote.swap_payment_dest,
          fee_rate: parseInt(getQuote.swap_fee_rate, decBase),
          max_tokens: parseInt(getQuote.max_swap_amount, decBase),
          min_tokens: parseInt(getQuote.min_swap_amount, decBase),
        });
      }],
    },
    returnResult({reject, resolve, of: 'quote'}, cbk));
  });
};

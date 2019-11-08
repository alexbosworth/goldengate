const asyncAuto = require('async/auto');
const {returnResult} = require('asyncjs-util');

const decBase = 10;

/** Get swap quote from swap service

  {
    service: <Swap Service Object>
    tokens: <Tokens Number>
  }

  @returns via cbk or Promise
  {
    cltv_delta: <CLTV Delta Number>
    deposit: <Deposit Tokens Number>
    destination: <Destination Public Key Hex String>
    fee: <Total Fee Tokens Number>
  }
*/
module.exports = ({service, tokens}, cbk) => {
  return new Promise((resolve, reject) => {
    return asyncAuto({
      // Check arguments
      validate: cbk => {
        if (!service || !service.loopOutQuote) {
          return cbk([400, 'ExpectedServiceToGetSwapOutQuote']);
        }

        if (!tokens) {
          return cbk([400, 'ExpectedTokensToGetSwapOutQuote']);
        }

        return cbk();
      },

      // Get quote
      getQuote: ['validate', ({}, cbk) => {
        return service.loopOutQuote({amt: tokens.toString()}, (err, res) => {
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

        if (!getQuote.prepay_amt) {
          return cbk([503, 'ExpectedPrepayAmountInSwapQuoteResponse']);
        }

        if (!getQuote.swap_fee) {
          return cbk([503, 'ExpectedSwapFeeAmountInSwapQuoteResponse']);
        }

        if (!getQuote.swap_payment_dest) {
          return cbk([503, 'ExpectedSwapPaymentDestinationPublicKey']);
        }

        return cbk(null, {
          cltv_delta: getQuote.cltv_delta,
          deposit: Number(getQuote.prepay_amt),
          destination: getQuote.swap_payment_dest,
          fee: Number(getQuote.swap_fee),
        });
      }],
    },
    returnResult({reject, resolve, of: 'quote'}, cbk));
  });
};

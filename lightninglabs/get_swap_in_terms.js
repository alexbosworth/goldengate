const asyncAuto = require('async/auto');
const {returnResult} = require('asyncjs-util');

/** Get swap terms from swap service

  {
    service: <Swap Service Object>
  }

  @returns via cbk or Promise
  {
    max_tokens: <Maximum Swap Tokens Number>
    min_tokens: <Minimum Swap Tokens Number>
  }
*/
module.exports = ({service}, cbk) => {
  return new Promise((resolve, reject) => {
    return asyncAuto({
      // Check arguments
      validate: cbk => {
        if (!service || !service.loopInTerms) {
          return cbk([400, 'ExpectedServiceToGetSwapInTerms']);
        }

        return cbk();
      },

      // Get terms
      getTerms: ['validate', ({}, cbk) => {
        return service.loopInTerms({}, (err, res) => {
          if (!!err) {
            return cbk([503, 'UnexpectedErrorGettingSwapInTerms', {err}]);
          }

          if (!res) {
            return cbk([503, 'ExpectedResponseWhenGettingSwapInTerms']);
          }

          return cbk(null, {
            max_swap_amount: res.max_swap_amount,
            min_swap_amount: res.min_swap_amount,
          });
        });
      }],

      // Terms
      terms: ['getTerms', ({getTerms}, cbk) => {
        if (!getTerms.max_swap_amount) {
          return cbk([503, 'ExpectedMaxSwapAmountInSwapInTermsResponse']);
        }

        if (!getTerms.min_swap_amount) {
          return cbk([503, 'ExpectedMinSwapAmountInSwapInTermsResponse']);
        }

        return cbk(null, {
          max_tokens: Number(getTerms.max_swap_amount),
          min_tokens: Number(getTerms.min_swap_amount),
        });
      }],
    },
    returnResult({reject, resolve, of: 'terms'}, cbk));
  });
};

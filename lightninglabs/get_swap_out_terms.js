const asyncAuto = require('async/auto');
const {returnResult} = require('asyncjs-util');

const {protocolVersion} = require('./conf/swap_service');

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
        if (!service || !service.loopOutTerms) {
          return cbk([400, 'ExpectedServiceToGetSwapOutTerms']);
        }

        return cbk();
      },

      // Get terms
      getTerms: ['validate', ({}, cbk) => {
        return service.loopOutTerms({
          protocol_version: protocolVersion,
        },
        (err, res) => {
          if (!!err) {
            return cbk([503, 'UnexpectedErrorGettingSwapTerms', {err}]);
          }

          if (!res) {
            return cbk([503, 'ExpectedResponseWhenGettingSwapTerms']);
          }

          return cbk(null, res);
        });
      }],

      // Loop out terms
      terms: ['getTerms', ({getTerms}, cbk) => {
        if (!getTerms.max_swap_amount) {
          return cbk([503, 'ExpectedMaxSwapAmountInSwapTermsResponse']);
        }

        if (!getTerms.min_swap_amount) {
          return cbk([503, 'ExpectedMinSwapAmountInSwapTermsResponse']);
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

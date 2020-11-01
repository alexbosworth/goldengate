const asyncAuto = require('async/auto');
const {returnResult} = require('asyncjs-util');

const {protocolVersion} = require('./conf/swap_service');

const connectionFailureMessage = '14 UNAVAILABLE: No connection established';

/** Get swap terms from swap service

  {
    metadata: <Authentication Metadata Object>
    service: <Swap Service Object>
  }

  @returns via cbk or Promise
  {
    max_cltv_delta: <Maximum Permissible CLTV Delta Number>
    max_tokens: <Maximum Swap Tokens Number>
    min_cltv_delta: <Minimum Permissible CLTV Delta Number>
    min_tokens: <Minimum Swap Tokens Number>
  }
*/
module.exports = ({metadata, service}, cbk) => {
  return new Promise((resolve, reject) => {
    return asyncAuto({
      // Check arguments
      validate: cbk => {
        if (!metadata) {
          return cbk([400, 'ExpectedAuthenticationMetadataToGetSwapOutTerms']);
        }

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
        metadata,
        (err, res) => {
          if (!!err && err.message === connectionFailureMessage) {
            return cbk([503, 'FailedToConnectToService']);
          }

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
        if (!getTerms.max_cltv_delta) {
          return cbk([503, 'ExpectedMaxCltvDeltaInSwapTermsResponse']);
        }

        if (!getTerms.max_swap_amount) {
          return cbk([503, 'ExpectedMaxSwapAmountInSwapTermsResponse']);
        }

        if (!getTerms.min_cltv_delta) {
          return cbk([503, 'ExpectedMinCltvDeltaInSwapTermsResponse']);
        }

        if (!getTerms.min_swap_amount) {
          return cbk([503, 'ExpectedMinSwapAmountInSwapTermsResponse']);
        }

        return cbk(null, {
          max_cltv_delta: getTerms.max_cltv_delta,
          max_tokens: Number(getTerms.max_swap_amount),
          min_cltv_delta: getTerms.min_cltv_delta,
          min_tokens: Number(getTerms.min_swap_amount),
        });
      }],
    },
    returnResult({reject, resolve, of: 'terms'}, cbk));
  });
};

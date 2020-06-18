const asyncAuto = require('async/auto');
const {Metadata} = require('grpc');
const {returnResult} = require('asyncjs-util');

const {protocolVersion} = require('./conf/swap_service');

const authHeader = 'Authorization';

/** Get swap terms from swap service

  {
    [macaroon]: <Base64 Encoded Macaroon String>
    [preimage]: <Authentication Preimage Hex String>
    service: <Swap Service Object>
  }

  @returns via cbk or Promise
  {
    max_tokens: <Maximum Swap Tokens Number>
    min_tokens: <Minimum Swap Tokens Number>
  }
*/
module.exports = ({macaroon, preimage, service}, cbk) => {
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
        const metadata = new Metadata();

        if (!!macaroon) {
          metadata.add(authHeader, `LSAT ${macaroon}:${preimage}`);
        }

        return service.loopOutTerms({
          protocol_version: protocolVersion,
        },
        metadata,
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

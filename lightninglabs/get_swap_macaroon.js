const {randomBytes} = require('crypto');

const asyncAuto = require('async/auto');
const {returnResult} = require('asyncjs-util');

const getSwapOutTerms = require('./get_swap_out_terms');
const lightningLabsSwapService = require('./lightning_labs_swap_service');
const parsePaymentMetadata = require('./parse_payment_metadata');

const authHeader = 'www-authenticate';
const bufferFromHex = hex => Buffer.from(hex, 'hex');
const makePublicKeyHex = () => `02${randomBytes(32).toString('hex')}`;
const makeSwapHash = () => randomBytes(32);
const paymentRequiredError = 'payment required';

/** Get an unpaid swap macaroon that can be converted to a paid one by paying

  {
    service: <Unauthenticated Swap Service Object>
  }

  @returns via cbk or Promise
  {
    id: <Authenticated User Id String>
    macaroon: <Base64 Encoded Unpaid Macaroon String>
    request: <Payment Request To Activate Macaroon BOLT 11 String>
  }
*/
module.exports = ({service}, cbk) => {
  return new Promise((resolve, reject) => {
    return asyncAuto({
      // Check arguments
      validate: cbk => {
        if (!service) {
          return cbk([400, 'ExpectedServiceToGetSwapMacaroonPaymentDetails']);
        }

        return cbk();
      },

      // Get a tokens value to try
      getSwapValue: ['validate', ({}, cbk) => getSwapOutTerms({service}, cbk)],

      // Get an unpaid macaroon
      getUnpaidMacaroon: ['getSwapValue', ({getSwapValue}, cbk) => {
        return service.newLoopOutSwap({
          amt: getSwapValue.max_tokens.toString(),
          receiver_key: bufferFromHex(makePublicKeyHex()),
          swap_hash: makeSwapHash(),
        },
        err => {
          // An error is expected
          if (!err) {
            return cbk([503, 'ExpectedPaymentErrWhenPurchasingSwapMacaroon']);
          }

          if (err.details !== paymentRequiredError) {
            return cbk([503, 'UnexpectedErrorPurchasingSwapMacaroon', {err}]);
          }

          const metadata = err.metadata.get(authHeader);

          const {payment} = parsePaymentMetadata({metadata});

          if (!payment) {
            return cbk([503, 'FailedToGetPaymentDetailsForSwapMacaroon']);
          }

          return cbk(null, {
            id: payment.id,
            macaroon: payment.macaroon,
            request: payment.request,
          });
        });
      }],
    },
    returnResult({reject, resolve, of: 'getUnpaidMacaroon'}, cbk));
  });
};

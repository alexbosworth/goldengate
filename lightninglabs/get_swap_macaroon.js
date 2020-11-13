const {randomBytes} = require('crypto');

const asyncAuto = require('async/auto');
const {returnResult} = require('asyncjs-util');

const getSwapOutTerms = require('./get_swap_out_terms');
const lightningLabsSwapService = require('./lightning_labs_swap_service');
const parsePaymentMetadata = require('./parse_payment_metadata');
const {protocolVersion} = require('./conf/swap_service');

const authHeader = 'www-authenticate';
const bufferFromHex = hex => Buffer.from(hex, 'hex');
const defaultUserAgent = 'nodejs';
const expiry = 1;
const makePublicKeyHex = () => `02${randomBytes(32).toString('hex')}`;
const makeSwapHash = () => randomBytes(32);
const metadata = {get: () => [String()]};
const paymentRequiredError = 'payment required';

/** Get an unpaid swap macaroon that can be converted to a paid one by paying

  {
    service: <Unauthenticated Swap Service Object>
    [user_agent]: <User Agent String>
  }

  @returns via cbk or Promise
  {
    id: <Authenticated User Id String>
    macaroon: <Base64 Encoded Unpaid Macaroon String>
    request: <Payment Request To Activate Macaroon BOLT 11 String>
  }
*/
module.exports = (args, cbk) => {
  return new Promise((resolve, reject) => {
    return asyncAuto({
      // Check arguments
      validate: cbk => {
        if (!args.service) {
          return cbk([400, 'ExpectedServiceToGetSwapMacaroonPaymentDetails']);
        }

        return cbk();
      },

      // Get a tokens value to try
      getSwapValue: ['validate', ({}, cbk) => {
        return getSwapOutTerms({metadata, service: args.service}, cbk);
      }],

      // Get an unpaid macaroon
      getUnpaidMacaroon: ['getSwapValue', ({getSwapValue}, cbk) => {
        return args.service.newLoopOutSwap({
          expiry,
          amt: getSwapValue.max_tokens.toString(),
          protocol_version: protocolVersion,
          receiver_key: bufferFromHex(makePublicKeyHex()),
          swap_hash: makeSwapHash(),
          user_agent: args.user_agent || defaultUserAgent,
        },
        metadata,
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

const asyncAuto = require('async/auto');
const {returnResult} = require('asyncjs-util');

const {protocolVersion} = require('./conf/swap_service');
const {taprootVersion} = require('./conf/swap_service');

const failureReason = 'LND_FAILURE_REASON_NONE';
const hexAsBuffer = hex => Buffer.from(hex, 'hex');
const remainingHops = 1;
const routeType = 'INVOICE_ROUTE';

/** Cancel a swap out

  {
    id: <Funding Request Payment Hash Hex String>
    [is_taproot]: <Use Taproot Swap Service Protocol Bool>
    metadata: <Authentication Metadata Object>
    payment: <Funding Request Payment Identifier Hex String>
    service: <Swap Service Object>
  }

  @returns via cbk or Promise
*/
module.exports = (args, cbk) => {
  return new Promise((resolve, reject) => {
    return asyncAuto({
      // Check arguments
      validate: cbk => {
        if (!args.id) {
          return cbk([400, 'ExpectedPaymentHashToCancelSwapOut']);
        }

        if (!args.metadata) {
          return cbk([400, 'ExpectedAuthenticationMetadataToCancelSwapOut']);
        }

        if (!args.payment) {
          return cbk([400, 'ExpectedPaymentIdentifierToCancelSwapOut']);
        }

        if (!args.service || !args.service.cancelLoopOutSwap) {
          return cbk([400, 'ExpectedServiceToCancelSwapOut']);
        }

        return cbk();
      },

      // Cancel the swap out
      cancel: ['validate', ({}, cbk) => {
        return args.service.cancelLoopOutSwap({
          payment_address: hexAsBuffer(args.payment),
          protocol_version: args.is_taproot ? taprootVersion : protocolVersion,
          swap_hash: hexAsBuffer(args.id),
          route_cancel: {
            attempts: [],
            failure: failureReason,
            route_type: routeType,
          }
        },
        args.metadata,
        err => {
          if (!!err) {
            return cbk([503, 'UnexpectedErrorCancelingSwapOut', {err}]);
          }

          return cbk();
        });
      }],
    },
    returnResult({reject, resolve}, cbk));
  });
};

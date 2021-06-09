const asyncAuto = require('async/auto');
const {returnResult} = require('asyncjs-util');

const {protocolVersion} = require('./conf/swap_service');

const failureReason = 'LND_FAILURE_REASON_NONE';
const hexAsBuffer = hex => Buffer.from(hex, 'hex');
const remainingHops = 1;
const routeType = 'INVOICE_ROUTE';

/** Cancel a swap out

  {
    id: <Funding Request Payment Hash Hex String>
    metadata: <Authentication Metadata Object>
    payment: <Funding Request Payment Identifier Hex String>
    service: <Swap Service Object>
  }

  @returns via cbk or Promise
*/
module.exports = ({id, metadata, payment, service}, cbk) => {
  return new Promise((resolve, reject) => {
    return asyncAuto({
      // Check arguments
      validate: cbk => {
        if (!id) {
          return cbk([400, 'ExpectedPaymentHashToCancelSwapOut']);
        }

        if (!metadata) {
          return cbk([400, 'ExpectedAuthenticationMetadataToCancelSwapOut']);
        }

        if (!payment) {
          return cbk([400, 'ExpectedPaymentIdentifierToCancelSwapOut']);
        }

        if (!service || !service.cancelLoopOutSwap) {
          return cbk([400, 'ExpectedServiceToCancelSwapOut']);
        }

        return cbk();
      },

      // Cancel the swap out
      cancel: ['validate', ({}, cbk) => {
        return service.cancelLoopOutSwap({
          payment_address: hexAsBuffer(payment),
          protocol_version: protocolVersion,
          swap_hash: hexAsBuffer(id),
          route_cancel: {
            attempts: [],
            failure: failureReason,
            route_type: routeType,
          }
        },
        metadata,
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

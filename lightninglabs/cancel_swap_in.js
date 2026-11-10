const asyncAuto = require('async/auto');
const {returnResult} = require('asyncjs-util');

const abandonedMessage = 'client did not provide fallback tx signatures';
const hexAsBuffer = hex => Buffer.from(hex, 'hex');
const isHash = n => !!n && /^[0-9A-F]{64}$/i.test(n);

/** Cancel a swap in before signing its HTLC transactions

  {
    id: <Swap Hash Hex String>
    metadata: <Authentication Metadata Object>
    service: <Swap Service Object>
  }

  @returns via cbk or Promise
*/
module.exports = ({id, metadata, service}, cbk) => {
  return new Promise((resolve, reject) => {
    return asyncAuto({
      // Check arguments
      validate: cbk => {
        if (!isHash(id)) {
          return cbk([400, 'ExpectedSwapHashToCancelSwapIn']);
        }

        if (!metadata) {
          return cbk([400, 'ExpectedAuthMetadataToCancelSwapIn']);
        }

        if (!service || !service.pushStaticAddressHtlcSigs) {
          return cbk([400, 'ExpectedServiceToCancelSwapIn']);
        }

        return cbk();
      },

      // Push empty HTLC signatures to abandon the swap
      cancel: ['validate', ({}, cbk) => {
        return service.pushStaticAddressHtlcSigs({
          swap_hash: hexAsBuffer(id),
        },
        metadata,
        err => {
          // Exit early when the service canceled the swap without signatures
          if (!!err && `${err.details}`.startsWith(abandonedMessage)) {
            return cbk();
          }

          if (!!err) {
            return cbk([503, 'UnexpectedErrorCancelingSwapIn', {err}]);
          }

          return cbk();
        });
      }],
    },
    returnResult({reject, resolve}, cbk));
  });
};

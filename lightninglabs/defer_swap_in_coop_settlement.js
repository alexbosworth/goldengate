const asyncAuto = require('async/auto');
const asyncify = require('async/asyncify');
const {decodePsbt} = require('psbt');
const {idForTransaction} = require('@alexbosworth/blockchain');
const {returnResult} = require('asyncjs-util');

const hexAsBuffer = hex => Buffer.from(hex, 'hex');
const isHash = n => !!n && /^[0-9A-F]{64}$/i.test(n);
const notFinishedMessage = 'swap not finished yet';
const reversed = buffer => Buffer.from(buffer).reverse();

/** Defer cosigning the cooperative settlement of a swap in that is not paid

  {
    id: <Swap Hash Hex String>
    metadata: <Authentication Metadata Object>
    psbt: <Settlement Transaction PSBT Hex String>
    service: <Swap Service Object>
  }

  @returns via cbk or Promise
*/
module.exports = ({id, metadata, psbt, service}, cbk) => {
  return new Promise((resolve, reject) => {
    return asyncAuto({
      // Check arguments
      validate: cbk => {
        if (!isHash(id)) {
          return cbk([400, 'ExpectedSwapHashToDeferSettlement']);
        }

        if (!metadata) {
          return cbk([400, 'ExpectedAuthMetadataToDeferSettlement']);
        }

        if (!psbt) {
          return cbk([400, 'ExpectedPsbtToDeferSettlement']);
        }

        if (!service || !service.pushStaticAddressSweeplessSigs) {
          return cbk([400, 'ExpectedServiceToDeferSettlement']);
        }

        return cbk();
      },

      // Get the sweep transaction id
      transactionId: ['validate', asyncify(({}) => {
        try {
          const transaction = decodePsbt({psbt}).unsigned_transaction;

          return idForTransaction({transaction}).id;
        } catch (err) {
          throw [400, 'ExpectedValidPsbtToDeferSettlement', {err}];
        }
      })],

      // Tell the swap service that the swap is not finished
      defer: ['transactionId', ({transactionId}, cbk) => {
        return service.pushStaticAddressSweeplessSigs({
          error_message: notFinishedMessage,
          swap_hash: hexAsBuffer(id),
          txid: reversed(hexAsBuffer(transactionId)),
        },
        metadata,
        err => {
          if (!!err) {
            return cbk([503, 'UnexpectedErrorDeferringSettlement', {err}]);
          }

          return cbk();
        });
      }],
    },
    returnResult({reject, resolve}, cbk));
  });
};

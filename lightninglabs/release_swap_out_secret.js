const asyncAuto = require('async/auto');
const {returnResult} = require('asyncjs-util');

const {protocolVersion} = require('./conf/swap_service');

const bufferFromHex = hex => Buffer.from(hex, 'hex');
const isPreimage = n => !!n && /^[0-9A-F]{64}$/i.test(n);

/** Release the swap secret to the swap server to obtain inbound more quickly

  {
    metadata: <Authentication Metadata Object>
    secret: <Secret Preimage Hex String>
    service: <Swap Service Object>
  }

  @returns via cbk or Promise
*/
module.exports = ({metadata, secret, service}, cbk) => {
  return new Promise((resolve, reject) => {
    return asyncAuto({
      // Check arguments
      validate: cbk => {
        if (!metadata) {
          return cbk([400, 'ExpectedAuthenticationMetadataToReleaseSecret']);
        }

        if (!isPreimage(secret)) {
          return cbk([400, 'ExpectedHexEncodedSecretToRevealForSwapOut']);
        }

        if (!service || !service.loopOutPushPreimage) {
          return cbk([400, 'ExpectedSwapServiceToRevealSwapOutSecret']);
        }

        return cbk();
      },

      // Reveal the secret to the server
      reveal: ['validate', ({}, cbk) => {
        return service.loopOutPushPreimage({
          preimage: bufferFromHex(secret),
          protocol_version: protocolVersion,
        },
        metadata,
        err => {
          if (!!err) {
            return cbk([503, 'UnexpectedErrorPushingPreimageForSwap', {err}]);
          }

          return cbk();
        });
      }],
    },
    returnResult({reject, resolve}, cbk));
  });
};

const asyncAuto = require('async/auto');
const {returnResult} = require('asyncjs-util');

const {protocolVersion} = require('./conf/swap_service');
const {taprootVersion} = require('./conf/swap_service');

const bufferFromHex = hex => Buffer.from(hex, 'hex');
const isPreimage = n => !!n && /^[0-9A-F]{64}$/i.test(n);

/** Release the swap secret to the swap server to obtain inbound more quickly

  {
    [is_taproot]: <Use Taproot Swap Service Protocol Bool>
    metadata: <Authentication Metadata Object>
    secret: <Secret Preimage Hex String>
    service: <Swap Service Object>
  }

  @returns via cbk or Promise
*/
module.exports = (args, cbk) => {
  return new Promise((resolve, reject) => {
    return asyncAuto({
      // Check arguments
      validate: cbk => {
        if (!args.metadata) {
          return cbk([400, 'ExpectedAuthenticationMetadataToReleaseSecret']);
        }

        if (!isPreimage(args.secret)) {
          return cbk([400, 'ExpectedHexEncodedSecretToRevealForSwapOut']);
        }

        if (!args.service || !args.service.loopOutPushPreimage) {
          return cbk([400, 'ExpectedSwapServiceToRevealSwapOutSecret']);
        }

        return cbk();
      },

      // Reveal the secret to the server
      reveal: ['validate', ({}, cbk) => {
        return args.service.loopOutPushPreimage({
          preimage: bufferFromHex(args.secret),
          protocol_version: args.is_taproot ? taprootVersion : protocolVersion,
        },
        args.metadata,
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

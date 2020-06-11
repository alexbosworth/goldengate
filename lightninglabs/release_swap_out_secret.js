const asyncAuto = require('async/auto');
const {Metadata} = require('grpc');
const {returnResult} = require('asyncjs-util');

const {protocolVersion} = require('./conf/swap_service');

const authHeader = 'Authorization';
const authSeparator = ':';
const bufferFromHex = hex => Buffer.from(hex, 'hex');
const isPreimage = n => !!n && /^[0-9A-F]{64}$/i.test(n);

/** Release the swap secret to the swap server to obtain inbound more quickly

  {
    auth_macaroon: <Base64 Encoded Macaroon String>
    auth_preimage: <Authentication Preimage Hex String>
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
        if (!args.auth_macaroon) {
          return cbk([400, 'ExpectedAuthenticationMacaroonToRevealSecret']);
        }

        if (!args.auth_preimage) {
          return cbk([400, 'ExpectedAuthenticationPreimageToRevealSecret']);
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
        const auth = [args.auth_macaroon, args.auth_preimage];
        const metadata = new Metadata();

        metadata.add(authHeader, `LSAT ${auth.join(authSeparator)}`);

        return args.service.loopOutPushPreimage({
          preimage: bufferFromHex(args.secret),
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

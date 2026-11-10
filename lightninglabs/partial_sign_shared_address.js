const asyncAuto = require('async/auto');
const {beginGroupSigningSession} = require('ln-service');
const {endGroupSigningSession} = require('ln-service');
const {returnResult} = require('asyncjs-util');
const {updateGroupSigningSession} = require('ln-service');

const outputKey = outputScript => outputScript.slice(4);
const xOnlyKey = key => key.length === 66 ? key.slice(2) : key;

/** Partially sign a hash with the shared address MuSig2 key

  {
    hash: <Hash To Sign Hex String>
    key_family: <Shared Address Client Key Family Number>
    key_index: <Shared Address Client Key Index Number>
    lnd: <Authenticated LND API Object>
    nonce: <Service MuSig2 Public Nonce Hex String>
    output_script: <Shared Address Output Script Hex String>
    root_hash: <Shared Address Taproot Script Tree Root Hash Hex String>
    service_public_key: <Shared Address Service Public Key Hex String>
  }

  @returns via cbk or Promise
  {
    nonce: <Client MuSig2 Public Nonce Hex String>
    signature: <Client Partial Signature Hex String>
  }
*/
module.exports = (args, cbk) => {
  return new Promise((resolve, reject) => {
    return asyncAuto({
      // Start a signing session with the shared address keys
      begin: cbk => {
        return beginGroupSigningSession({
          key_family: args.key_family,
          key_index: args.key_index,
          lnd: args.lnd,
          public_keys: [args.service_public_key],
          root_hash: args.root_hash,
        },
        cbk);
      },

      // The signing session key has to be the shared address key
      checkKey: ['begin', ({begin}, cbk) => {
        const sessionKey = xOnlyKey(begin.external_key);

        // Exit early when the session is for the shared address key
        if (sessionKey === outputKey(args.output_script)) {
          return cbk();
        }

        // A failure to clean up the session is not an error
        return endGroupSigningSession({id: begin.id, lnd: args.lnd}, () => {
          return cbk([503, 'UnexpectedSessionKeyForSharedAddress']);
        });
      }],

      // Partially sign the hash with the service nonce
      update: ['begin', 'checkKey', ({begin}, cbk) => {
        return updateGroupSigningSession({
          hash: args.hash,
          id: begin.id,
          lnd: args.lnd,
          nonces: [args.nonce],
        },
        (err, res) => {
          // A failure to clean up the session is not an error
          return endGroupSigningSession({id: begin.id, lnd: args.lnd}, () => {
            return cbk(err, res);
          });
        });
      }],

      // Pair the client nonce with the partial signature
      signed: ['begin', 'update', ({begin, update}, cbk) => {
        return cbk(null, {nonce: begin.nonce, signature: update.signature});
      }],
    },
    returnResult({reject, resolve, of: 'signed'}, cbk));
  });
};

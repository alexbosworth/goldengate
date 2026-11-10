const asyncAuto = require('async/auto');
const {beginGroupSigningSession} = require('ln-service');
const {returnResult} = require('asyncjs-util');

const outputKey = outputScript => outputScript.slice(4);
const xOnlyKey = key => key.length === 66 ? key.slice(2) : key;

/** Begin a shared address MuSig2 session and track it in sessions

  {
    key_family: <Shared Address Client Key Family Number>
    key_index: <Shared Address Client Key Index Number>
    lnd: <Authenticated LND API Object>
    output_script: <Shared Address Output Script Hex String>
    root_hash: <Shared Address Taproot Script Tree Root Hash Hex String>
    service_public_key: <Shared Address Service Public Key Hex String>
    sessions: [{
      id: <Signing Session Id Hex String>
      nonce: <Client MuSig2 Public Nonce Hex String>
    }]
  }

  @returns via cbk or Promise
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

      // Track the session so that it can be cleaned up
      track: ['begin', ({begin}, cbk) => {
        args.sessions.push({id: begin.id, nonce: begin.nonce});

        return cbk();
      }],

      // The signing session key has to be the shared address key
      checkKey: ['begin', 'track', ({begin}, cbk) => {
        const sessionKey = xOnlyKey(begin.external_key);

        if (sessionKey !== outputKey(args.output_script)) {
          return cbk([503, 'UnexpectedSessionKeyForSharedAddress']);
        }

        return cbk();
      }],
    },
    returnResult({reject, resolve}, cbk));
  });
};

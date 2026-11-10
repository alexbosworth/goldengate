const asyncAuto = require('async/auto');
const {endGroupSigningSession} = require('ln-service');
const {returnResult} = require('asyncjs-util');
const {updateGroupSigningSession} = require('ln-service');

const schnorrSigHexLength = 128;

/** Sign with a shared address MuSig2 session and combine the signatures

  {
    hash: <Hash To Sign Hex String>
    lnd: <Authenticated LND API Object>
    nonce: <Service MuSig2 Public Nonce Hex String>
    session: {
      id: <Signing Session Id Hex String>
    }
    signature: <Service Partial Signature Hex String>
  }

  @returns via cbk or Promise
  {
    signature: <Combined Schnorr Signature Hex String>
  }
*/
module.exports = ({hash, lnd, nonce, session, signature}, cbk) => {
  return new Promise((resolve, reject) => {
    return asyncAuto({
      // Partially sign the hash with the service nonce
      update: cbk => {
        return updateGroupSigningSession({
          hash,
          lnd,
          id: session.id,
          nonces: [nonce],
        },
        cbk);
      },

      // Combine the partial signatures, which ends the session
      end: ['update', ({}, cbk) => {
        return endGroupSigningSession({
          lnd,
          id: session.id,
          signatures: [signature],
        },
        cbk);
      }],

      // Mark the session as ended and check the combined signature
      combined: ['end', ({end}, cbk) => {
        // The session is finished once the signatures are combined
        session.is_ended = true;

        if (!end.signature || end.signature.length !== schnorrSigHexLength) {
          return cbk([503, 'ExpectedSignatureForSpentUtxo']);
        }

        return cbk(null, {signature: end.signature});
      }],
    },
    returnResult({reject, resolve, of: 'combined'}, cbk));
  });
};

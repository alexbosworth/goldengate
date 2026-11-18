const {beginGroupSigningSession} = require('ln-service');
const {endGroupSigningSession} = require('ln-service');
const {makeLnd} = require('mock-lnd');
const {updateGroupSigningSession} = require('ln-service');
const {verifySchnorr} = require('tiny-secp256k1');

const hexAsBuffer = hex => Buffer.from(hex, 'hex');
const serviceSecret = Buffer.alloc(32, 2).toString('hex');

/** Make a swap service cosigner for spends of shared address utxos

  {
    client_public_key: <Client Public Key Hex String>
    root_hash: <Shared Address Script Root Hash Hex String>
  }

  @returns
  {
    cosign: ({hash, key, nonce}) => <Service Partial Signature Hex String>
    isComplete: ({hash, key, nonce, signature}) => <Valid Signature Bool>
    keyFor: nonce => <Key of Session With Service Public Nonce String>
    lnd: <Service Fake LND Object>
    nonceFor: key => <Service Public Nonce Hex String>
  }
*/
module.exports = args => {
  const keys = {};
  const lnd = makeLnd({secret: serviceSecret});

  // Sessions are named by keys, like the outpoints of utxos
  const sessions = {};

  // Call a signing method of the fake LND, which responds right away
  const call = (method, request) => {
    const result = {};

    method({...request, lnd}, (err, res) => {
      result.err = err;
      result.res = res;
    });

    return result;
  };

  // Sign for a utxo with the nonce of the client
  const cosign = ({hash, key, nonce}) => {
    const {res} = call(updateGroupSigningSession, {
      hash,
      id: sessions[key].id,
      nonces: [nonce],
    });

    return res.signature;
  };

  return {
    cosign,
    lnd,
    isComplete: ({hash, key, nonce, signature}) => {
      cosign({hash, key, nonce});

      const {err, res} = call(endGroupSigningSession, {
        id: sessions[key].id,
        signatures: [signature],
      });

      // Exit early when the signatures do not combine into a signature
      if (!!err) {
        return false;
      }

      const outputKey = hexAsBuffer(sessions[key].external_key);
      const sig = hexAsBuffer(res.signature);

      return verifySchnorr(hexAsBuffer(hash), outputKey, sig);
    },
    keyFor: nonce => keys[nonce],
    nonceFor: key => {
      const {res} = call(beginGroupSigningSession, {
        key_family: 6,
        key_index: 0,
        public_keys: [args.client_public_key],
        root_hash: args.root_hash,
      });

      keys[res.nonce] = key;
      sessions[key] = res;

      return res.nonce;
    },
  };
};

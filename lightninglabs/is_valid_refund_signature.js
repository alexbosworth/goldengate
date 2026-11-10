const {verifySchnorr} = require('tiny-secp256k1');

const hexAsBuffer = hex => Buffer.from(hex, 'hex');
const schnorrSignatureHexLength = 128;

/** Check that a default sighash Schnorr signature is valid for a hash

  {
    hash: <Signed Hash Hex String>
    key: <X-Only Signing Public Key Hex String>
    signature: <Schnorr Signature Hex String>
  }

  @returns
  <Signature Is Valid Bool>
*/
module.exports = ({hash, key, signature}) => {
  if (signature.length !== schnorrSignatureHexLength) {
    return false;
  }

  // A malformed signature throws instead of failing to verify
  try {
    return verifySchnorr(
      hexAsBuffer(hash),
      hexAsBuffer(key),
      hexAsBuffer(signature)
    );
  } catch (err) {
    return false;
  }
};

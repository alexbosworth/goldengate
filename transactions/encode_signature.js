const encodeDerInteger = require('./encode_der_integer');

const {concat} = Buffer;
const derInteger = bytes => encodeDerInteger({bytes}).encoded;
const derIntegerTag = 0x02;
const derSequenceTag = 0x30;
const {from} = Buffer;
const hashTypes = [0x01, 0x02, 0x03, 0x81, 0x82, 0x83];
const {isBuffer} = Buffer;
const signatureByteLength = 64;
const valueByteLength = 32;

/** Encode a compact ECDSA signature as a DER signature with a sighash flag

  {
    flag: <Signature Hash Type Flag Number>
    signature: <Compact R and S Signature Buffer Object>
  }

  @throws
  <Error>

  @returns
  {
    encoded: <DER Encoded Signature With Sighash Flag Buffer Object>
  }
*/
module.exports = ({flag, signature}) => {
  if (!hashTypes.includes(flag)) {
    throw new Error('ExpectedKnownSignatureHashTypeFlagToEncodeSignature');
  }

  if (!isBuffer(signature)) {
    throw new Error('ExpectedCompactSignatureBytesToEncodeSignature');
  }

  if (signature.length !== signatureByteLength) {
    throw new Error('ExpectedCompactSignatureLengthToEncodeSignature');
  }

  const r = derInteger(signature.subarray(Number(), valueByteLength));
  const s = derInteger(signature.subarray(valueByteLength));

  // The R and S values are each encoded as DER integers within a sequence
  const elements = concat([
    from([derIntegerTag, r.length]),
    r,
    from([derIntegerTag, s.length]),
    s,
  ]);

  // The sighash flag byte follows the DER sequence
  const encoded = concat([
    from([derSequenceTag, elements.length]),
    elements,
    from([flag]),
  ]);

  return {encoded};
};

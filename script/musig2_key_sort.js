const compressedPublicKeyHexLength = 66;
const {isArray} = Array;
const isHex = n => /^[0-9A-F]*$/i.test(n);

/** Sort public keys into BIP 327 MuSig2 key sort order

  {
    public_keys: [<Compressed Public Key Hex String>]
  }

  @throws
  <Error>

  @returns
  {
    sorted: [<Compressed Public Key Hex String>]
  }
*/
module.exports = args => {
  if (!isArray(args.public_keys)) {
    throw new Error('ExpectedArrayOfPublicKeysToSortForMuSig2');
  }

  const isCompressed = n => !!n && n.length === compressedPublicKeyHexLength;

  if (args.public_keys.some(key => !isHex(key) || !isCompressed(key))) {
    throw new Error('ExpectedCompressedPublicKeysToSortForMuSig2');
  }

  // Equal length lowercase hex strings sort the same as their bytes
  return {sorted: args.public_keys.map(n => n.toLowerCase()).sort()};
};

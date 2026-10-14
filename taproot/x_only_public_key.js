const compressedKeyHexLength = 66;
const parityPrefixHexLength = 2;

/** Get the x-only form of a public key

  Taproot internal keys are x-only, so a compressed key loses its parity byte

  {
    [public_key]: <Compressed or X Only Public Key Hex String>
  }

  @returns
  {
    [x_only]: <X Only Public Key Hex String>
  }
*/
module.exports = args => {
  // Exit early when the key is not in compressed form
  if (!args.public_key || args.public_key.length !== compressedKeyHexLength) {
    return {x_only: args.public_key};
  }

  return {x_only: args.public_key.slice(parityPrefixHexLength)};
};

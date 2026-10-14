const {isPrivate} = require('tiny-secp256k1');
const {pointFromScalar} = require('tiny-secp256k1');

const bufferAsHex = buffer => Buffer.from(buffer).toString('hex');
const hexAsBuffer = hex => Buffer.from(hex, 'hex');
const isCompressed = true;

/** Get the public key for a private key

  {
    private_key: <Private Key Hex String>
  }

  @throws
  <Error>

  @returns
  {
    public_key: <Public Key Hex String>
  }
*/
module.exports = args => {
  if (!args.private_key) {
    throw new Error('ExpectedPrivateKeyToDerivePublicKey');
  }

  if (!isPrivate(hexAsBuffer(args.private_key))) {
    throw new Error('ExpectedValidPrivateKeyToDerivePublicKey');
  }

  const key = pointFromScalar(hexAsBuffer(args.private_key), isCompressed);

  return {public_key: bufferAsHex(key)};
};

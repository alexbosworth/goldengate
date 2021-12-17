const bufferAsHex = buffer => buffer.toString('hex');
const hexAsBuffer = hex => Buffer.from(hex, 'hex');

/** Get the public key for a private key

  {
    ecp: <ECPair Object>
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
  if (!args.ecp) {
    throw new Error('ExpectedEcpairToDerivePublicKey');
  }

  if (!args.private_key){
    throw new Error('ExpectedPrivateKeyToDerivePublicKey');
  }

  const keyPair = args.ecp.fromPrivateKey(hexAsBuffer(args.private_key));

  return {public_key: bufferAsHex(keyPair.publicKey)};
};

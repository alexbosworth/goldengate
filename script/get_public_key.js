const {ECPair} = require('ecpair');

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
  if (!args.private_key){
    throw new Error('ExpectedPrivateKeyToDerivePublicKey');
  }

  const keyPair = ECPair.fromPrivateKey(Buffer.from(args.private_key, 'hex'));

  return {public_key: keyPair.publicKey.toString('hex')};
};

const {randomBytes} = require('crypto');

const {isPrivate} = require('tiny-secp256k1');

const bufferAsHex = buffer => buffer.toString('hex');
const privateKeyByteLength = 32;

/** Make a random private key

  {}

  @returns
  {
    private_key: <Private Key Hex String>
  }
*/
module.exports = ({}) => {
  const key = {};

  // Random bytes have a negligible chance of being outside the key range
  do {
    key.bytes = randomBytes(privateKeyByteLength);
  } while (!isPrivate(key.bytes));

  return {private_key: bufferAsHex(key.bytes)};
};

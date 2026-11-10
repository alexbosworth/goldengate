const {createHash} = require('crypto');

const {concat} = Buffer;
const sha256 = buffer => createHash('sha256').update(buffer).digest();

/** Get a BIP 340 tagged hash of a message

  {
    message: <Message Buffer Object>
    tag: <Tag String>
  }

  @returns
  <Tagged Hash Buffer Object>
*/
module.exports = ({message, tag}) => {
  const tagHash = sha256(Buffer.from(tag));

  return sha256(concat([tagHash, tagHash, message]));
};

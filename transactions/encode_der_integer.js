const {concat} = Buffer;
const highBit = 0x80;
const notFoundIndex = -1;
const zero = Buffer.from([0]);

/** Encode a big endian unsigned number as a DER integer

  DER integers are minimally encoded and positive

  {
    bytes: <Big Endian Unsigned Number Buffer Object>
  }

  @returns
  {
    encoded: <DER Integer Buffer Object>
  }
*/
module.exports = ({bytes}) => {
  const start = bytes.findIndex(n => n !== Number());

  // Exit early when the value is zero, which is encoded as a single zero byte
  if (start === notFoundIndex) {
    return {encoded: zero};
  }

  const value = bytes.subarray(start);

  // A value with its high bit set gets a leading zero to keep it positive
  return {encoded: !!(value[0] & highBit) ? concat([zero, value]) : value};
};

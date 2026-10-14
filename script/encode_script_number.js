const {abs} = Math;
const byteBase = 256;
const {floor} = Math;
const {from} = Buffer;
const {isSafeInteger} = Number;
const signBit = 0x80;

/** Encode a number as a minimally encoded script number

  Script numbers are little endian, with the sign in the most significant bit

  {
    number: <Number to Encode Number>
  }

  @throws
  <Error>

  @returns
  {
    encoded: <Encoded Script Number Buffer Object>
  }
*/
module.exports = ({number}) => {
  if (!isSafeInteger(number)) {
    throw new Error('ExpectedIntegerToEncodeAsScriptNumber');
  }

  const isNegative = number < 0;
  const magnitude = [];

  // Write out the magnitude of the number as little endian bytes
  for (let value = abs(number); !!value; value = floor(value / byteBase)) {
    magnitude.push(value % byteBase);
  }

  const [mostSignificant] = magnitude.slice().reverse();

  // Exit early when there is no room for the sign in the most significant byte
  if (!!(mostSignificant & signBit)) {
    return {encoded: from(magnitude.concat(isNegative ? signBit : Number()))};
  }

  // Negative numbers set the sign bit of the most significant byte
  if (isNegative) {
    magnitude.push(magnitude.pop() | signBit);
  }

  return {encoded: from(magnitude)};
};

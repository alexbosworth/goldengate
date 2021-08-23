const base64FromBuffer = buffer => buffer.toString('base64');
const bufferFromBase64 = base64 => Buffer.from(base64, 'base64');

/** Determine if a string is base64 encoded

  {
    input: <Base64 Input String>
  }

  @returns
  {
    is_base64: <String is Base64 Encoded Bool>
  }
*/
module.exports = ({input}) => {
  try {
    bufferFromBase64(input)
  } catch (e) {
    return {is_base64: false};
  }

  return {is_base64: base64FromBuffer(bufferFromBase64(input)) === input};
};

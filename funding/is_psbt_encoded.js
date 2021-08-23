const {decodePsbt} = require('psbt');

/** Determine if a string is PSBT encoded

  {
    input: <PSBT Input String>
  }

  @returns
  {
    is_psbt: <String is PSBT Encoded Bool>
  }
*/
module.exports = ({input}) => {
  try {
    return {is_psbt: !!decodePsbt({psbt: input})};
  } catch (e) {
    return {is_psbt: false};
  }
};

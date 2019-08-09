const p2shOutputScript = require('./p2sh_output_script');
const p2wshOutputScript = require('./p2wsh_output_script');

/** Get P2SH Nested P2WSH Output Script

  {
    script: <Witness Program Hex String>
  }

  @returns
  {
    output: <P2SH Output Script Hex String>
  }
*/
module.exports = ({script}) => {
  const witnessProgram = p2wshOutputScript({script}).output;

  const {output} = p2shOutputScript({script: witnessProgram.toString('hex')});

  return {output};
};

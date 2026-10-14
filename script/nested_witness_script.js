const {scriptElementsAsScript} = require('@alexbosworth/blockchain');

const p2wshOutputScript = require('./p2wsh_output_script');

const hexAsBuffer = hex => Buffer.from(hex, 'hex');

/** Get a scriptSig-nested witness script

  {
    witness_script: <Witness Program Hex String>
  }

  @throws
  <Error>

  @returns
  {
    redeem_script: <Redeem Script Hex String>
  }
*/
module.exports = args => {
  if (!args.witness_script) {
    throw new Error('ExpectedWitnessProgramToCreatedNestedScriptSig');
  }

  // The nested witness program is the P2WSH output script for the script
  const {output} = p2wshOutputScript({script: args.witness_script});

  // The redeem script pushes the witness program
  const {script} = scriptElementsAsScript({elements: [hexAsBuffer(output)]});

  return {redeem_script: script};
};

const {transactionFromComponents} = require('@alexbosworth/blockchain');

const {isArray} = Array;
const isInt32 = n => Number.isInteger(n) && n >= -(2 ** 31) && n < 2 ** 31;
const isTokens = n => Number.isInteger(n) && n >= 0 && n <= 21e14;
const isUint32 = n => Number.isInteger(n) && n >= 0 && n < 2 ** 32;

/** Encode transaction components as a raw transaction

  Numbers must be whole numbers in range so they are encoded exactly

  {
    inputs: [{
      id: <Spending Transaction Id Hex String>
      script: <ScriptSig Script Hex String>
      sequence: <Sequence Number>
      vout: <Spending Transaction Output Index Number>
      [witness]: [<Script Stack Element Hex String>]
    }]
    locktime: <Timelock nLockTime Number>
    outputs: [{
      script: <ScriptPub Script Hex String>
      tokens: <Tokens Count Number>
    }]
    version: <Version Number>
  }

  @throws
  <Error>

  @returns
  {
    transaction: <Hex Encoded Transaction String>
  }
*/
module.exports = ({inputs, locktime, outputs, version}) => {
  if (!isArray(inputs)) {
    throw new Error('ExpectedArrayOfInputsToEncodeTransaction');
  }

  if (inputs.some(input => !input || !isUint32(input.sequence))) {
    throw new Error('ExpectedSequenceNumberForEachInputToEncodeTransaction');
  }

  if (inputs.some(input => !isUint32(input.vout))) {
    throw new Error('ExpectedOutputIndexForEachInputToEncodeTransaction');
  }

  if (!isUint32(locktime)) {
    throw new Error('ExpectedLocktimeNumberToEncodeTransaction');
  }

  if (!isArray(outputs)) {
    throw new Error('ExpectedArrayOfOutputsToEncodeTransaction');
  }

  if (outputs.some(output => !output || !isTokens(output.tokens))) {
    throw new Error('ExpectedValidTokensForEachOutputToEncodeTransaction');
  }

  if (!isInt32(version)) {
    throw new Error('ExpectedVersionNumberToEncodeTransaction');
  }

  return transactionFromComponents({inputs, locktime, outputs, version});
};

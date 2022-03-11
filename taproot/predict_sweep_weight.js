const bufferFromHex = hex => Buffer.from(hex, 'hex');
const preimageLength = 32;
const schnorrSignatureLength = 64;
const sequenceLength = 4;
const shortPushdataLength = 1;
const sumOf = arr => arr.reduce((sum, n) => sum + n, 0);

/** Estimate the weight of a transaction after witness stack is added

  {
    [control]: <Control Block Hex String>
    [script]: <Leaf Script Hex String>
    [unlock]: <Unlock Data Push Hex String>
    weight: <Weight Without Signed Inputs Number>
  }

  @throws
  <Error>

  @returns
  {
    weight: <Estimated Weight Number>
  }
*/
module.exports = ({control, script, unlock, weight}) => {
  if (!weight) {
    throw new Error('ExpectedUnsignedTxWeightToPredictSignedTxWeight');
  }

  if (!!script && !control) {
    throw new Error('ExpectedControlBlockToPredictSignedTxWeight');
  }

  if (!!unlock && !script) {
    throw new Error('ExpectedLeafScriptToPredictSignedTxWeight');
  }

  // Exit early when there is a direct key spend
  if (!script) {
    return {
      weight: sumOf([weight, sequenceLength, schnorrSignatureLength]),
    };
  }

  // Exit early when there is a timeout path spend
  if (!unlock) {
    return {
      weight: sumOf([
        weight,
        sequenceLength,
        shortPushdataLength,
        schnorrSignatureLength,
        shortPushdataLength,
        bufferFromHex(script).length,
        bufferFromHex(control).length,
      ]),
    };
  }

  return {
    weight: sumOf([
      weight,
      sequenceLength,
      shortPushdataLength,
      schnorrSignatureLength,
      shortPushdataLength,
      preimageLength,
      shortPushdataLength,
      bufferFromHex(script).length,
      bufferFromHex(control).length,
    ]),
  };
};

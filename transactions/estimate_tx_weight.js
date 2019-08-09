const bufferFromHex = hex => Buffer.from(hex, 'hex');
const maxSignatureLength = 72;
const sequenceLength = 4;
const shortPushdataLength = 1;
const sumOf = arr => arr.reduce((sum, n) => sum + n, 0);

/** Estimate the weight of a transaction after signed SegWit inputs are added

  {
    unlock: <Unlock Data Push Hex String>
    weight: <Weight Without Signed Inputs Number>
    witness_script: <Witness Script Hex String>
  }

  @throws
  <Error>

  @returns
  {
    weight: <Estimated Weight Number>
  }
*/
module.exports = args => {
  if (!args.unlock) {
    throw new Error('ExpectedUnlockElementForTxWeightEstimation');
  }

  if (!args.weight) {
    throw new Error('ExpectedUnsignedTxWeightToEstimateSignedTxWeight');
  }

  if (!args.witness_script) {
    throw new Error('ExpectedWitnessScriptForTxWeightEstimation');
  }

  const weight = sumOf([
    args.weight,
    shortPushdataLength,
    maxSignatureLength,
    shortPushdataLength,
    bufferFromHex(args.unlock).length,
    sequenceLength,
    bufferFromHex(args.witness_script).length,
  ]);

  return {weight};
};

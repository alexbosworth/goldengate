const {isSwapScriptV2} = require('./../script');

const bufferFromHex = hex => Buffer.from(hex, 'hex');
const maxSignatureLength = 72;
const preimageLength = 32;
const publicKeyLength = 33;
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

  if (!isSwapScriptV2({script: args.witness_script})) {
    throw new Error('ExpectedKnownWitnessScriptForTxWeightEstimation');
  }

  const unlock = bufferFromHex(args.unlock);

  // Exit early when the preimage unlocks the claim path
  if (unlock.length === preimageLength) {
    return {
      weight: sumOf([
        args.weight,
        shortPushdataLength,
        maxSignatureLength,
        shortPushdataLength,
        unlock.length,
        sequenceLength,
        bufferFromHex(args.witness_script).length,
      ]),
    };
  }

  // The refund path has a signature, the refund key and an empty element
  return {
    weight: sumOf([
      args.weight,
      shortPushdataLength,
      maxSignatureLength,
      shortPushdataLength,
      publicKeyLength,
      shortPushdataLength,
      sequenceLength,
      bufferFromHex(args.witness_script).length,
    ]),
  };
};

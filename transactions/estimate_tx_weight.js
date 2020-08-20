const {versionOfSwapScript} = require('./../script');

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

  const {version} = versionOfSwapScript({script: args.witness_script});

  switch (version) {
  case 1:
    return {
      weight: sumOf([
        args.weight,
        shortPushdataLength,
        maxSignatureLength,
        shortPushdataLength,
        bufferFromHex(args.unlock).length,
        sequenceLength,
        bufferFromHex(args.witness_script).length,
      ]),
    };

  case 2:
    const unlock = bufferFromHex(args.unlock);

    switch (unlock.length) {
    case preimageLength:
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

    default:
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
    }

  default:
    throw new Error('ExpectedKnownWitnessScriptForTxWeightEstimation');
  }
};

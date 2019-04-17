const {isArray} = Array;
const maxSignatureLength = 72;
const sequenceLength = 4;
const shortPushdataLength = 1;

/** Estimate the weight of a transaction after signed SegWit inputs are added

  {
    redeems: [<Redeem Script / Witness Program Hex String>]
    secret: <Preimage Hex String>
    weight: <Weight Without Signed Inputs Number>
  }

  @throws
  <Error>

  @returns
  {
    weight: <Estimated Weight Number>
  }
*/
module.exports = ({redeems, secret, weight}) => {
  if (!isArray(redeems)) {
    throw new Error('ExpectedRedeemScriptsForTxWeightEstimation');
  }

  if (!secret) {
    throw new Error('ExpectedSecretPreimageForTxWeightEstimation');
  }

  if (!weight) {
    throw new Error('ExpectedUnsignedTxWeightToEstimateSignedTxWeight');
  }

  const finalWeight = redeems.reduce((sum, redeem) => {
    return [
      shortPushdataLength,
      maxSignatureLength,
      shortPushdataLength,
      Buffer.from(secret, 'hex').length,
      sequenceLength,
      Buffer.from(redeem, 'hex').length,
      sum,
    ].reduce((sum, n) => sum + n);
  },
  weight);

  return {weight: finalWeight};
};

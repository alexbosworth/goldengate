const feeRateDivisor = BigInt(1e6);

/** Calculate the amount of tokens for a payment request

  {
    base_fee: <Base Fee Tokens Number>
    fee_rate: <Fee Rate in Parts Per Million Number>
    tokens: <Tokens Number>
  }

  @throws
  <Error>

  @returns
  {
    fee: <Tokens Number>
  }
*/
module.exports = args => {
  if (args.base_fee === undefined) {
    throw new Error('ExpectedBaseFeeAmountToCalculateSwapInInvoiceTokens');
  }

  if (args.fee_rate === undefined) {
    throw new Error('ExpectedFeeRateToCalculateSwapInInvoiceTokens');
  }

  if (args.fee_rate > feeRateDivisor) {
    throw new Error('ExpectedFeeRateInPartsPerMillionForTokensCalculation');
  }

  if (!args.tokens) {
    throw new Error('ExpectedTokensToCalculateSwapInInvoiceTokens');
  }

  const tokens = BigInt(args.tokens);

  const percentageFee = tokens * BigInt(args.fee_rate) / feeRateDivisor;

  return {fee: Number(percentageFee) + args.base_fee};
};

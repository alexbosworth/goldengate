const feeRateDenominator = 1e6;

/** Check that a swap quote is within acceptable parameters

  {
    base_fee: <Base Fee Tokens Number>
    cltv_delta: <Swap CLTV Delta Number>
    deposit: <Security Deposit Tokens Number>
    fee_rate: <Fee Rate Parts Per Million Number>
    max_deposit: <Maximum Deposit Tokens Number>
    max_fee: <Maximum Fee to Pay Number>
    max_tokens: <Maximum Swap Tokens Number>
    min_cltv_delta: <Minimum CLTV Delta Number>
    min_tokens: <Minimum Swap Tokens Number>
    tokens: <Swap Tokens Number>
  }

  @throws <Error>

  @returns
  {}
*/
module.exports = args => {
  if (args.tokens < args.min_tokens) {
    throw new Error('TooFewTokensToInitiateSwap');
  }

  if (args.tokens > args.max_tokens) {
    throw new Error('TooManyTokensToInitiateSwap');
  }

  const bipFee = args.tokens * args.fee_rate / feeRateDenominator;

  if (args.base_fee + bipFee > args.max_fee) {
    throw new Error('FeesExceedMaxAcceptableFee');
  }

  if (args.deposit > args.max_deposit) {
    throw new Error('DepositExceedsMaxFeeRate');
  }

  if (args.cltv_delta < args.min_cltv_delta) {
    throw new Error('ExpectedMoreTimeToCompleteSwap');
  }

  return {};
};

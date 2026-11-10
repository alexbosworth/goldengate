const changeDustTokens = 330;

/** Get the spent and change tokens of a shared address spend

  {
    fee: <Fee Tokens Without A Change Output Number>
    fee_with_change: <Fee Tokens With A Change Output Number>
    [tokens]: <Spend Tokens Number>
    total: <Total Utxo Tokens Number>
  }

  @returns
  {
    [change]: <Change Tokens Number>
    [spend]: <Spend Tokens Number>
  }
*/
module.exports = args => {
  // Without tokens, all of the utxos are spent
  if (args.tokens === undefined) {
    return {change: 0, spend: args.total - args.fee};
  }

  const excess = args.total - args.tokens;

  // Excess tokens are change when they are more than the fee and dust
  if (excess - args.fee_with_change >= changeDustTokens) {
    return {change: excess - args.fee_with_change, spend: args.tokens};
  }

  // Excess tokens that would be dust change are given to miners
  if (excess - args.fee >= 0) {
    return {change: 0, spend: args.tokens};
  }

  return {};
};

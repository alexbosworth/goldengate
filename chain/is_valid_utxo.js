const isHash = n => !!n && /^[0-9A-F]{64}$/i.test(n);
const isHeight = n => Number.isInteger(n) && n >= 0;
const isTokens = n => Number.isSafeInteger(n) && n > 0;
const isVout = n => Number.isInteger(n) && n >= 0 && n <= 4294967295;

/** Check that a utxo has value, a valid outpoint and a valid height

  {
    [confirmation_height]: <Utxo Confirmation Height Number>
    tokens: <Utxo Tokens Number>
    transaction_id: <Utxo Transaction Id Hex String>
    transaction_vout: <Utxo Transaction Output Index Number>
  }

  @returns
  <Is Valid Utxo Bool>
*/
module.exports = utxo => {
  // Exit early when the utxo has no valid transaction id
  if (!utxo || !isHash(utxo.transaction_id)) {
    return false;
  }

  // Exit early when the utxo has no valid output index
  if (!isVout(utxo.transaction_vout)) {
    return false;
  }

  // Exit early when the utxo has no value
  if (!isTokens(utxo.tokens)) {
    return false;
  }

  // Unconfirmed utxos have no confirmation height
  if (utxo.confirmation_height === undefined) {
    return true;
  }

  return isHeight(utxo.confirmation_height);
};

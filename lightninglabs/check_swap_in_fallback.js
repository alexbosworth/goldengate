const {maxSwapInBackupFallbackFeeRatio} = require('./conf/swap_service');
const {maxSwapInFallbackFeeRatio} = require('./conf/swap_service');
const {swapInFallbackFee} = require('./../taproot');

const asBuffer = n => Buffer.from(n.toString('base64'), 'base64');
const bufferAsHex = buffer => buffer.toString('hex');
const {floor} = Math;
const {isArray} = Array;
const {isSafeInteger} = Number;
const nonceLength = 66;

/** Check the service signing info for a swap in fallback fee rate

  {
    utxos_count: <Swap Utxos Count Number>
    has_change: <HTLC Transaction Has Change Output Bool>
    is_backup: <Fallback Is A Backup Fee Rate Fallback Bool>
    [signing]: {
      fee_rate: <Fee Tokens Per Thousand Weight Units String>
      nonces: [<Service MuSig2 Public Nonce Buffer Object>]
    }
    tokens: <Swap Tokens Number>
    type: <Fallback Fee Rate Type String>
  }

  @returns
  {
    [error]: [<Error Code Number>, <Error Type String>, <Details Object>]
    [fallback]: {
      fee: <Fallback Transaction Fee Tokens Number>
      fee_tokens_per_kw: <Fee Tokens Per Thousand Weight Units Number>
      nonces: [<Service MuSig2 Public Nonce Hex String>]
      type: <Fallback Fee Rate Type String>
    }
  }
*/
module.exports = args => {
  if (!args.signing || !isArray(args.signing.nonces)) {
    return {error: [503, 'ExpectedFallbackSigningInfoForSwapIn']};
  }

  if (args.signing.nonces.length !== args.utxos_count) {
    return {error: [503, 'ExpectedNonceForEverySwapInUtxo']};
  }

  const nonces = args.signing.nonces.map(n => asBuffer(n));

  if (nonces.some(nonce => nonce.length !== nonceLength)) {
    return {error: [503, 'ExpectedValidNoncesForSwapIn']};
  }

  const rate = Number(args.signing.fee_rate);

  if (!isSafeInteger(rate) || rate < 0) {
    return {error: [503, 'ExpectedFallbackFeeRateForSwapIn']};
  }

  const {fee} = swapInFallbackFee({
    utxos_count: args.utxos_count,
    fee_tokens_per_kw: rate,
    has_change: args.has_change,
  });

  const ratio = args.is_backup ?
    maxSwapInBackupFallbackFeeRatio :
    maxSwapInFallbackFeeRatio;

  // Avoid an HTLC that spends too much of the swap tokens on fees
  if (fee > floor(args.tokens * ratio)) {
    return {
      error: [503, 'ExpectedLowerFallbackFeeForSwapIn', {type: args.type}],
    };
  }

  return {
    fallback: {
      fee,
      fee_tokens_per_kw: rate,
      nonces: nonces.map(nonce => bufferAsHex(nonce)),
      type: args.type,
    },
  };
};

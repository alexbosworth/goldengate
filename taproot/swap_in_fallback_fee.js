const baseTxSize = 4 + 4;
const inputSize = 32 + 4 + 1 + 4;
const {isInteger} = Number;
const {isSafeInteger} = Number;
const keySpendWitnessSize = 1 + 1 + 64;
const p2trOutputSize = 8 + 1 + 34;
const p2wshOutputSize = 8 + 1 + 34;
const varIntSize = n => n < 0xfd ? 1 : (n <= 0xffff ? 3 : 5);
const weightUnitsPerKw = BigInt(1e3);
const witnessHeaderSize = 1 + 1;
const witnessScaleFactor = 4;

/** Get the fee of a swap in service fallback transaction

  {
    utxos_count: <Utxos Spent In HTLC Transaction Count Number>
    fee_tokens_per_kw: <Fee Tokens Per Thousand Weight Units Number>
    [has_change]: <HTLC Transaction Has Change Output Bool>
  }

  @throws
  <Error>

  @returns
  {
    fee: <Fallback Transaction Fee Tokens Number>
    weight: <HTLC Transaction Estimated Weight Units Number>
  }
*/
module.exports = args => {
  if (!isInteger(args.utxos_count) || args.utxos_count < 1) {
    throw new Error('ExpectedUtxosCountToGetServiceFallbackFee');
  }

  if (!isSafeInteger(args.fee_tokens_per_kw) || args.fee_tokens_per_kw < 0) {
    throw new Error('ExpectedFeeRateToGetServiceFallbackFee');
  }

  const change = !!args.has_change ? [p2trOutputSize] : [];

  const outputs = [p2wshOutputSize].concat(change);

  const outputsSize = outputs.reduce((sum, n) => sum + n, 0);

  // The stripped size excludes the witness data
  const strippedSize = baseTxSize +
    varIntSize(args.utxos_count) + args.utxos_count * inputSize +
    varIntSize(outputs.length) + outputsSize;

  // Every utxo input has a key spend witness with a default sighash sig
  const witnessSize = witnessHeaderSize +
    args.utxos_count * keySpendWitnessSize;

  const weight = strippedSize * witnessScaleFactor + witnessSize;

  // The fee rounds down, like the lnd fee for weight calculation
  const feeRate = BigInt(args.fee_tokens_per_kw);

  const fee = feeRate * BigInt(weight) / weightUnitsPerKw;

  return {weight, fee: Number(fee)};
};

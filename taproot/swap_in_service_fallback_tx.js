const {idForTransaction} = require('@alexbosworth/blockchain');
const {v1HashToSign} = require('p2tr');

const {encodeTransaction} = require('./../transactions');
const {p2wshOutputScript} = require('./../script');
const swapInFallbackFee = require('./swap_in_fallback_fee');

const emptyScript = '';
const {isArray} = Array;
const isHash = n => !!n && /^[0-9A-F]{64}$/i.test(n);
const isHex = n => !!n && !(n.length % 2) && /^[0-9A-F]*$/i.test(n);
const {isInteger} = Number;
const isP2tr = n => !!n && /^5120[0-9A-F]{64}$/i.test(n);
const {isSafeInteger} = Number;
const locktime = 0;
const maxVout = 4294967295;
const outpoint = n => `${n.transaction_id}:${n.transaction_vout}`;
const sequence = 0;
const sighashDefault = 0;
const version = 2;

/** Get an unsigned swap in service fallback transaction

  Pass the utxos in the order they were given to create the swap

  {
    utxos: [{
      tokens: <Utxo Tokens Number>
      transaction_id: <Utxo Transaction Id Hex String>
      transaction_vout: <Utxo Transaction Output Index Number>
    }]
    fee_tokens_per_kw: <Fee Tokens Per Thousand Weight Units Number>
    output_script: <Shared Address Output Script Hex String>
    script: <Swap HTLC Witness Script Hex String>
    tokens: <Swap Tokens Number>
  }

  @throws
  <Error>

  @returns
  {
    hashes: [<Utxo Input Signature Hash Hex String>]
    id: <HTLC Transaction Id Hex String>
    transaction: <Unsigned HTLC Transaction Hex String>
  }
*/
module.exports = args => {
  // A utxo has a transaction id, an output index and a value
  const isUtxo = utxo => {
    if (!utxo || !isHash(utxo.transaction_id)) {
      return false;
    }

    const vout = utxo.transaction_vout;

    if (!isInteger(vout) || vout < 0 || vout > maxVout) {
      return false;
    }

    return isSafeInteger(utxo.tokens) && utxo.tokens > 0;
  };

  if (!isArray(args.utxos) || !args.utxos.length) {
    throw new Error('ExpectedUtxosForServiceFallbackTx');
  }

  if (args.utxos.some(utxo => !isUtxo(utxo))) {
    throw new Error('ExpectedValidUtxosForServiceFallbackTx');
  }

  const outpoints = args.utxos.map(n => outpoint(n).toLowerCase());

  // A transaction cannot spend the same utxo twice
  if (new Set(outpoints).size !== outpoints.length) {
    throw new Error('ExpectedUniqueUtxosForServiceFallbackTx');
  }

  if (!isP2tr(args.output_script)) {
    throw new Error('ExpectedSharedAddressOutputScriptForServiceFallbackTx');
  }

  if (!isHex(args.script)) {
    throw new Error('ExpectedHtlcScriptForServiceFallbackTx');
  }

  if (!isSafeInteger(args.tokens) || args.tokens < 1) {
    throw new Error('ExpectedSwapTokensForServiceFallbackTx');
  }

  const total = args.utxos.reduce((sum, n) => sum + n.tokens, 0);

  const change = total - args.tokens;

  if (change < 0) {
    throw new Error('ExpectedUtxosToCoverServiceFallbackTokens');
  }

  const {fee} = swapInFallbackFee({
    utxos_count: args.utxos.length,
    fee_tokens_per_kw: args.fee_tokens_per_kw,
    has_change: !!change,
  });

  if (fee >= args.tokens) {
    throw new Error('ExpectedSwapTokensAboveServiceFallbackFee');
  }

  // The HTLC output comes first, then any change back to the shared address
  const outputs = [{
    script: p2wshOutputScript({script: args.script}).output,
    tokens: args.tokens - fee,
  }];

  if (!!change) {
    outputs.push({script: args.output_script, tokens: change});
  }

  const {transaction} = encodeTransaction({
    locktime,
    outputs,
    version,
    inputs: args.utxos.map(utxo => ({
      sequence,
      id: utxo.transaction_id,
      script: emptyScript,
      vout: utxo.transaction_vout,
    })),
  });

  // Every utxo input spends a shared address output
  const spends = args.utxos.map(utxo => ({
    script: args.output_script,
    tokens: utxo.tokens,
  }));

  // Key spends sign with the default sighash and commit to all the spends
  const hashes = args.utxos.map((utxo, vin) => {
    return v1HashToSign({spends, transaction, vin, sighash: sighashDefault});
  });

  return {
    transaction,
    hashes: hashes.map(({hash}) => hash),
    id: idForTransaction({transaction}).id,
  };
};

const bip65Encode = require('bip65').encode;
const {OP_FALSE} = require('bitcoin-ops');
const {outputScriptForAddress} = require('@alexbosworth/blockchain');
const {sizeOfTransaction} = require('@alexbosworth/blockchain');

const encodeTransaction = require('./encode_transaction');
const estimateTxWeight = require('./estimate_tx_weight');
const {names} = require('./../conf/networks');
const {nestedWitnessScript} = require('./../script');
const witnessForResolution = require('./witness_for_resolution');

const asTx = components => encodeTransaction(components).transaction;
const bufferAsHex = buffer => buffer.toString('hex');
const {ceil} = Math;
const defaultVersion = 1;
const dummy = Buffer.from(OP_FALSE.toString(16), 'hex');
const emptyScript = '';
const {isBuffer} = Buffer;
const minSequence = 0;
const minTokens = 0;
const vRatio = 4;

/** Build a refund transaction to claim funds back from a swap

  {
    block_height: <Timelock Block Height Number>
    fee_tokens_per_vbyte: <Fee Per Virtual Byte Token Rate Number>
    [is_nested]: <Refund Spending From Nested Output Bool>
    network: <Network Name String>
    [private_key]: <Refund Private Key Hex String>
    sweep_address: <Sweep Tokens to Address String>
    tokens: <UTXO Tokens Number>
    transaction_id: <UTXO Transaction Id Hex String>
    transaction_vout: <UTXO Transaction Vout Number>
    witness_script: <UTXO Witness Script Hex String>
  }

  @throws
  <Error> on invalid arguments

  @returns
  {
    transaction: <Sweep Transaction Hex Serialized String>
  }
*/
module.exports = args => {
  if (!args.block_height) {
    throw new Error('ExpectedLocktimeHeightForRefundTransaction');
  }

  if (!args.fee_tokens_per_vbyte) {
    throw new Error('ExpectedFeeRateToUseForRefundTransaction');
  }

  if (!args.network || !names[args.network]) {
    throw new Error('ExpectedKnownNetworkForRefundTransaction');
  }

  if (!args.sweep_address) {
    throw new Error('ExpectedDestinationForRefundTransactionToSweepOutTo');
  }

  if (!args.tokens) {
    throw new Error('ExpectedUtxoTokensAmountForRefundTransaction');
  }

  if (!args.transaction_id) {
    throw new Error('ExpectedTransactionIdToCreateRefundTransaction');
  }

  if (args.transaction_vout === undefined) {
    throw new Error('ExpectedTransactionVoutToCreateRefundTransaction');
  }

  if (!args.witness_script) {
    throw new Error('ExpectedWitnessScriptForRefundTransaction');
  }

  const {script} = outputScriptForAddress({
    network: args.network,
    address: args.sweep_address,
  });

  // OP_CLTV needs the locktime set and prohibits a final sequence
  const tx = {
    inputs: [{
      id: args.transaction_id,
      script: emptyScript,
      sequence: minSequence,
      vout: args.transaction_vout,
    }],
    locktime: bip65Encode({blocks: args.block_height}),
    outputs: [{script, tokens: args.tokens}],
    version: defaultVersion,
  };

  // When using nested P2SH, the true script hash is added to the scriptSig
  if (!!args.is_nested) {
    const nested = nestedWitnessScript({witness_script: args.witness_script});

    // Set the nested redeem script
    tx.inputs.forEach(input => input.script = nested.redeem_script);
  }

  // Estimate final weight and reduce output by this estimate
  const {weight} = estimateTxWeight({
    unlock: dummy,
    weight: sizeOfTransaction({transaction: asTx(tx)}).weight,
    witness_script: args.witness_script,
  });

  // Reduce the final output value to give some tokens over to fees
  const [out] = tx.outputs;

  out.tokens -= args.fee_tokens_per_vbyte * ceil(weight / vRatio);

  if (out.tokens < minTokens) {
    throw new Error('ExpectedMoreTokensForRefundTransaction');
  }

  // A fractional fee rate can leave a fractional output value
  tx.outputs.forEach(out => out.tokens = ceil(out.tokens));

  // Exit early when there is no private key to sign the refund inputs
  if (!args.private_key) {
    return {transaction: asTx(tx)};
  }

  // Set witness
  tx.inputs.forEach((input, i) => {
    const {witness} = witnessForResolution({
      private_key: args.private_key,
      tokens: args.tokens,
      transaction: asTx(tx),
      unlock: dummy,
      vin: i,
      witness_script: args.witness_script,
    });

    // The dummy unlock element is a Buffer
    return input.witness = witness.map(n => isBuffer(n) ? bufferAsHex(n) : n);
  });

  return {transaction: asTx(tx)};
};


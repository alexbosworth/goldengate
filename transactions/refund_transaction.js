const {address} = require('bitcoinjs-lib');
const bip65Encode = require('bip65').encode;
const {networks} = require('bitcoinjs-lib');
const {OP_FALSE} = require('bitcoin-ops');
const {Transaction} = require('bitcoinjs-lib');

const estimateTxWeight = require('./estimate_tx_weight');
const {names} = require('./../conf/bitcoinjs-lib');
const {nestedWitnessScript} = require('./../script');
const witnessForResolution = require('./witness_for_resolution');

const {ceil} = Math;
const dummy = Buffer.from(OP_FALSE.toString(16), 'hex');
const hexAsBuf = hex => Buffer.from(hex, 'hex');
const minSequence = 0;
const minTokens = 0;
const {toOutputScript} = address;
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
    transaction_vout: <UTXO Transaction Vout Hex String>
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

  const network = networks[names[args.network]];
  const tx = new Transaction();

  // Add sweep output
  tx.addOutput(toOutputScript(args.sweep_address, network), args.tokens);

  // Add the UTXO to sweep
  tx.addInput(hexAsBuf(args.transaction_id).reverse(), args.transaction_vout);

  // OP_CLTV prohibits final sequence use
  tx.ins.forEach(input => input.sequence = minSequence);

  // Set transaction locktime which will be needed for OP_CLTV
  tx.locktime = bip65Encode({blocks: args.block_height});

  // When using nested P2SH, the true script hash is added to the scriptSig
  if (!!args.is_nested) {
    const nested = nestedWitnessScript({witness_script: args.witness_script});

    const script = hexAsBuf(nested.redeem_script);

    // Set the nested redeem script
    tx.ins.forEach((input, i) => tx.setInputScript(i, script));
  }

  // Estimate final weight and reduce output by this estimate
  const {weight} = estimateTxWeight({
    unlock: dummy,
    weight: tx.weight(),
    witness_script: args.witness_script,
  });

  // Reduce the final output value to give some tokens over to fees
  const [out] = tx.outs;

  out.value -= args.fee_tokens_per_vbyte * ceil(weight / vRatio);

  if (out.value < minTokens) {
    throw new Error('ExpectedMoreTokensForRefundTransaction');
  }

  // Exit early when there is no private key to sign the refund inputs
  if (!args.private_key) {
    return {transaction: tx.toHex()};
  }

  // Set witness
  tx.outs.forEach(out => out.value = ceil(out.value));

  tx.ins.forEach((input, i) => {
    const {witness} = witnessForResolution({
      private_key: args.private_key,
      tokens: args.tokens,
      transaction: tx.toHex(),
      unlock: dummy,
      vin: i,
      witness_script: args.witness_script,
    });

    return tx.setWitness(i, witness.map(n => hexAsBuf(n)));
  });

  return {transaction: tx.toHex()};
};


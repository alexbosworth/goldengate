const {address} = require('bitcoinjs-lib');
const bip65Encode = require('bip65').encode;
const {controlBlock} = require('p2tr');
const {Transaction} = require('bitcoinjs-lib');

const {names} = require('./../conf/bitcoinjs-lib');
const {outputScriptForAddress} = require('./../address');
const predictSweepWeight = require('./predict_sweep_weight');
const taprootResolutionWitness = require('./taproot_resolution_witness');

const asOut = (address, network) => outputScriptForAddress({address, network});
const {ceil} = Math;
const hexAsBuf = hex => Buffer.from(hex, 'hex');
const {isArray} = Array;
const minSequence = 0;
const minTokens = 0;
const vRatio = 4;

/** Build a refund transaction to claim funds back from a swap

  {
    block_height: <Timelock Block Height Number>
    ecp: <ECPair Object>
    external_key: <Taproot Output External Public Key Hex String>
    fee_tokens_per_vbyte: <Fee Per Virtual Byte Token Rate Number>
    internal_key: <Taproot Output Internal Public Key Hex String>
    network: <Network Name String>
    output_script: <Output Script Hex String>
    [private_key]: <Refund Private Key Hex String>
    refund_script: <UTXO Refund Leaf Script Hex String>
    script_branches: [{
      script: <Leaf Script Hex String>
    }]
    sweep_address: <Sweep Tokens to Address String>
    tokens: <UTXO Tokens Number>
    transaction_id: <UTXO Transaction Id Hex String>
    transaction_vout: <UTXO Transaction Vout Hex String>
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
    throw new Error('ExpectedLocktimeHeightForTaprootRefundTransaction');
  }

  if (!args.ecp) {
    throw new Error('ExpectedEcpObjectForTaprootRefundTransaction');
  }

  if (!args.external_key) {
    throw new Error('ExpectedExternalKeyForTaprootRefundTransaction');
  }

  if (!args.fee_tokens_per_vbyte) {
    throw new Error('ExpectedFeeRateToUseForTaprootRefundTransaction');
  }

  if (!args.output_script) {
    throw new Error('ExpectedOutputScriptForTaprootRefundTransaction');
  }

  if (!args.network || !names[args.network]) {
    throw new Error('ExpectedKnownNetworkForTaprootRefundTransaction');
  }

  if (!args.refund_script) {
    throw new Error('ExpectedLeafScriptForTaprootRefundTransaction');
  }

  if (!isArray(args.script_branches)) {
    throw new Error('ExpectedScriptBranchesForTaprootRefundTransaction');
  }

  if (!args.sweep_address) {
    throw new Error('ExpectedAddressForTaprootRefundTransactionToSweepOutTo');
  }

  if (!args.tokens) {
    throw new Error('ExpectedUtxoTokensAmountForTaprootRefundTransaction');
  }

  if (!args.transaction_id) {
    throw new Error('ExpectedTransactionIdToCreateRefundTaprootTransaction');
  }

  if (args.transaction_vout === undefined) {
    throw new Error('ExpectedTransactionVoutToCreateRefundTaprootTransaction');
  }

  const sweepScript = hexAsBuf(asOut(args.sweep_address, args.network).script);
  const tx = new Transaction();

  // Add sweep output
  tx.addOutput(sweepScript, args.tokens);

  // Add the UTXO to sweep
  tx.addInput(hexAsBuf(args.transaction_id).reverse(), args.transaction_vout);

  // OP_CLTV prohibits final sequence use
  tx.ins.forEach(input => input.sequence = minSequence);

  // Set transaction locktime which will be needed for OP_CLTV
  tx.locktime = bip65Encode({blocks: args.block_height});

  const {block} = controlBlock({
    external_key: args.external_key,
    internal_key: args.internal_key,
    leaf_script: args.refund_script,
    script_branches: args.script_branches,
  });

  // Estimate final weight and reduce output by this estimate
  const {weight} = predictSweepWeight({
    control: block,
    script: args.refund_script,
    weight: tx.weight(),
  });

  // Reduce the final output value to give some tokens over to fees
  const [out] = tx.outs;

  out.value -= args.fee_tokens_per_vbyte * ceil(weight / vRatio);

  if (out.value < minTokens) {
    throw new Error('ExpectedMoreTokensForTaprootRefundTransaction');
  }

  // Exit early when there is no private key to sign the refund inputs
  if (!args.private_key) {
    return {transaction: tx.toHex()};
  }

  // Set witness
  tx.outs.forEach(out => out.value = ceil(out.value));

  tx.ins.forEach((input, i) => {
    const {witness} = taprootResolutionWitness({
      ecp: args.ecp,
      external_key: args.external_key,
      internal_key: args.internal_key,
      output_script: args.output_script,
      private_key: args.private_key,
      refund_script: args.refund_script,
      script_branches: args.script_branches,
      tokens: args.tokens,
      transaction: tx.toHex(),
      vin: i,
    });

    return tx.setWitness(i, witness.map(n => hexAsBuf(n)));
  });

  return {transaction: tx.toHex()};
};


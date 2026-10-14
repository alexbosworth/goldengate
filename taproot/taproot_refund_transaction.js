const bip65Encode = require('bip65').encode;
const {controlBlock} = require('p2tr');
const {outputScriptForAddress} = require('@alexbosworth/blockchain');
const {sizeOfTransaction} = require('@alexbosworth/blockchain');

const {encodeTransaction} = require('./../transactions');
const {names} = require('./../conf/networks');
const predictSweepWeight = require('./predict_sweep_weight');
const taprootResolutionWitness = require('./taproot_resolution_witness');
const xOnlyPublicKey = require('./x_only_public_key');

const asOut = (address, network) => outputScriptForAddress({address, network});
const asTx = components => encodeTransaction(components).transaction;
const {ceil} = Math;
const defaultVersion = 1;
const emptyScript = '';
const {isArray} = Array;
const minSequence = 0;
const minTokens = 0;
const vRatio = 4;

/** Build a refund transaction to claim funds back from a swap

  {
    block_height: <Timelock Block Height Number>
    external_key: <Taproot Output External Public Key Hex String>
    fee_tokens_per_vbyte: <Fee Per Virtual Byte Token Rate Number>
    [internal_key]: <Taproot Output Internal Public Key Hex String>
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
    transaction_vout: <UTXO Transaction Vout Number>
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

  const sweepScript = asOut(args.sweep_address, args.network).script;

  // OP_CLTV needs the locktime set and prohibits a final sequence
  const tx = {
    inputs: [{
      id: args.transaction_id,
      script: emptyScript,
      sequence: minSequence,
      vout: args.transaction_vout,
    }],
    locktime: bip65Encode({blocks: args.block_height}),
    outputs: [{script: sweepScript, tokens: args.tokens}],
    version: defaultVersion,
  };

  // Control blocks use the x-only form of the internal key
  const internalKey = xOnlyPublicKey({public_key: args.internal_key}).x_only;

  const {block} = controlBlock({
    external_key: args.external_key,
    internal_key: internalKey,
    leaf_script: args.refund_script,
    script_branches: args.script_branches,
  });

  // Estimate final weight and reduce output by this estimate
  const {weight} = predictSweepWeight({
    control: block,
    script: args.refund_script,
    weight: sizeOfTransaction({transaction: asTx(tx)}).weight,
  });

  // Reduce the final output value to give some tokens over to fees
  const [out] = tx.outputs;

  out.tokens -= args.fee_tokens_per_vbyte * ceil(weight / vRatio);

  if (out.tokens < minTokens) {
    throw new Error('ExpectedMoreTokensForTaprootRefundTransaction');
  }

  // A fractional fee rate can leave a fractional output value
  tx.outputs.forEach(out => out.tokens = ceil(out.tokens));

  // Exit early when there is no private key to sign the refund inputs
  if (!args.private_key) {
    return {transaction: asTx(tx)};
  }

  // Set witness
  tx.inputs.forEach((input, i) => {
    const {witness} = taprootResolutionWitness({
      external_key: args.external_key,
      internal_key: internalKey,
      output_script: args.output_script,
      private_key: args.private_key,
      refund_script: args.refund_script,
      script_branches: args.script_branches,
      tokens: args.tokens,
      transaction: asTx(tx),
      vin: i,
    });

    return input.witness = witness;
  });

  return {transaction: asTx(tx)};
};


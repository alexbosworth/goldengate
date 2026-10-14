const {createPsbt} = require('psbt');
const {decodePsbt} = require('psbt');
const {extendPsbt} = require('psbt');
const {v1HashToSign} = require('p2tr');

const taprootClaimOutputs = require('./taproot_claim_outputs');

const defaultSighash = 0;
const {isArray} = Array;
const sequence = 0;
const vin = 0;

/** Make a cooperative transaction for a taproot swap

  {
    fee_tokens_per_vbyte: <Chain Fee Tokens Per VByte Number>
    network: <Network Name String>
    output_script: <Spending Output Script Hex String>
    script_branches: [{
      script: <Leaf Script Hex String>
    }]
    [sends]: [{
      address: <Delivery Address String>
      tokens: <Send Tokens Number>
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
    hash: <Hash to Sign Hex String>
    psbt: <Unsigned PSBT Hex String>
    transaction: <Unsigned Transaction Hex String>
  }
*/
module.exports = args => {
  if (!args.fee_tokens_per_vbyte) {
    throw new Error('ExpectedChainFeeTokensPerVbyteToGenerateTaprootCoopPsbt');
  }

  if (!args.network) {
    throw new Error('ExpectedNetworkNameToGenerateTaprootCoopPsbt');
  }

  if (!args.output_script) {
    throw new Error('ExpectedSpendingOutputScriptToGenerateTaprootPsbt');
  }

  if (!isArray(args.script_branches)) {
    throw new Error('ExpectedScriptBranchesToGenerateTaprootCoopPsbt');
  }

  if (!args.sweep_address) {
    throw new Error('ExpectedSweepAddressToGenerateTaprootCoopPsbt');
  }

  if (!args.tokens) {
    throw new Error('ExpectedUtxoTokensValueToGenerateTaprootCoopPsbt');
  }

  if (!args.transaction_id) {
    throw new Error('ExpectedTransactionIdToGenerateTaprootCoopPsbt');
  }

  if (args.transaction_vout === undefined) {
    throw new Error('ExpectedTxOutputIndexToGenerateTaprootCoopPsbt');
  }

  // Calculate outputs to attach
  const {outputs} = taprootClaimOutputs({
    address: args.sweep_address,
    network: args.network,
    rate: args.fee_tokens_per_vbyte,
    sends: args.sends || [],
    script: args.claim_script,
    tokens: args.tokens,
  });

  const base = createPsbt({
    outputs,
    utxos: [{sequence, id: args.transaction_id, vout: args.transaction_vout}],
  });

  // Add witness data to the PSBT
  const {psbt} = extendPsbt({
    inputs: [{
      sighash_type: defaultSighash,
      witness_utxo: {script_pub: args.output_script, tokens: args.tokens},
    }],
    psbt: base.psbt,
  });

  const transaction = decodePsbt({psbt}).unsigned_transaction;

  // The hash to sign commits to the output being spent by the single input
  const {hash} = v1HashToSign({
    transaction,
    vin,
    sighash: defaultSighash,
    spends: [{script: args.output_script, tokens: args.tokens}],
  });

  return {hash, psbt, transaction};
};

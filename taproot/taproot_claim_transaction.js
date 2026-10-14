const bip65Encode = require('bip65').encode;
const bip68Encode = require('bip68').encode;
const {controlBlock} = require('p2tr');

const {encodeTransaction} = require('./../transactions');
const taprootClaimOutputs = require('./taproot_claim_outputs');
const taprootResolutionWitness = require('./taproot_resolution_witness');
const xOnlyPublicKey = require('./x_only_public_key');

const asTx = components => encodeTransaction(components).transaction;
const claimBlocksCsv = 1;
const emptyScript = '';
const {isArray} = Array;
const transactionVersionForCsv = 2;

/** Make a claim transaction for a taproot swap

  {
    block_height: <Timelock Block Height Number>
    claim_script: <Claim Leaf Script Hex String>
    external_key: <Taproot Output External Public Key Hex String>
    fee_tokens_per_vbyte: <Chain Fee Tokens Per VByte Number>
    [internal_key]: <Taproot Output Internal Public Key Hex String>
    network: <Network Name String>
    output_script: <Output Script Hex String>
    [private_key]: <Raw Private Key Hex String>
    script_branches: [{
      script: <Leaf Script Hex String>
    }]
    secret: <HTLC Preimage Hex String>
    sends: [{
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
    transaction: <Raw Transaction Hex String>
  }
*/
module.exports = args => {
  if (!args.block_height) {
    throw new Error('ExpectedBlockHeightToGenerateTaprootClaimTransaction');
  }

  if (!args.claim_script) {
    throw new Error('ExpectedClaimScriptToGenerateClaimTransaction');
  }

  if (!args.external_key) {
    throw new Error('ExpectedExternalPublicKeyToGenerateTaprootClaimTx');
  }

  if (!args.fee_tokens_per_vbyte) {
    throw new Error('ExpectedChainFeeTokensPerVbyteToGenerateTaprootClaimTx');
  }

  if (!args.output_script) {
    throw new Error('ExpectedOutputScriptToGenerateTaprootClaimTransaction');
  }

  if (!args.network) {
    throw new Error('ExpectedNetworkNameToGenerateTaprootClaimTx');
  }

  if (!isArray(args.script_branches)) {
    throw new Error('ExpectedScriptBranchesToGenerateTaprootClaimTx');
  }

  if (!args.secret) {
    throw new Error('ExpectedHtlcPreimageToGenerateTaprootClaimTransaction');
  }

  if (!isArray(args.sends)) {
    throw new Error('ExpectedSendsToGenerateTaprootClaimTransaction');
  }

  if (!args.sweep_address) {
    throw new Error('ExpectedSweepAddressToGenerateTaprootClaimTransaction');
  }

  if (!args.tokens) {
    throw new Error('ExpectedUtxoTokensValueToGenerateTaprootClaimTx');
  }

  if (!args.transaction_id) {
    throw new Error('ExpectedTransactionIdToGenerateTaprootClaimTransaction');
  }

  if (args.transaction_vout === undefined) {
    throw new Error('ExpectedTxOutputIndexToGenerateTaprootClaimTransaction');
  }

  // Spend the output with a version 2 tx, as the claim script uses CSV
  const tx = {
    inputs: [{
      id: args.transaction_id,
      script: emptyScript,
      sequence: bip68Encode({blocks: claimBlocksCsv}),
      vout: args.transaction_vout,
    }],
    locktime: bip65Encode({blocks: args.block_height}),
    outputs: [],
    version: transactionVersionForCsv,
  };

  // Control blocks use the x-only form of the internal key
  const internalKey = xOnlyPublicKey({public_key: args.internal_key}).x_only;

  const {block} = controlBlock({
    internal_key: internalKey,
    external_key: args.external_key,
    leaf_script: args.claim_script,
    script_branches: args.script_branches,
  });

  // Calculate outputs to attach to the claim tx
  const {outputs} = taprootClaimOutputs({
    address: args.sweep_address,
    control: block,
    network: args.network,
    rate: args.fee_tokens_per_vbyte,
    sends: args.sends,
    script: args.claim_script,
    tokens: args.tokens,
  });

  // Attach all the outputs
  outputs.forEach(n => tx.outputs.push({script: n.script, tokens: n.tokens}));

  // Exit early when there is no private key to use for signing
  if (!args.private_key) {
    return {transaction: asTx(tx)};
  }

  // Generate signatures and attach witnesses to the transaction
  tx.inputs.forEach((input, vin) => {
    const {witness} = taprootResolutionWitness({
      vin,
      claim_script: args.claim_script,
      external_key: args.external_key,
      internal_key: internalKey,
      output_script: args.output_script,
      private_key: args.private_key,
      script_branches: args.script_branches,
      tokens: args.tokens,
      transaction: asTx(tx),
      unlock: args.secret,
    });

    return input.witness = witness;
  });

  return {transaction: asTx(tx)};
};

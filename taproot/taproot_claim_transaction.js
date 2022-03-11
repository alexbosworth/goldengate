const bip65Encode = require('bip65').encode;
const bip68Encode = require('bip68').encode;
const {controlBlock} = require('p2tr');
const {Transaction} = require('bitcoinjs-lib');

const taprootClaimOutputs = require('./taproot_claim_outputs');
const taprootResolutionWitness = require('./taproot_resolution_witness');

const claimBlocksCsv = 1;
const defaultSequence = 0;
const {fromHex} = Transaction;
const hexAsBuffer = hex => Buffer.from(hex, 'hex');
const {isArray} = Array;
const transactionVersionForCsv = 2;
const txAsHash = id => Buffer.from(id, 'hex').reverse();

/** Make a claim transaction for a taproot swap

  {
    block_height: <Timelock Block Height Number>
    claim_script: <Claim Leaf Script Hex String>
    ecp: <ECPair Object>
    external_key: <Taproot Output External Public Key Hex String>
    fee_tokens_per_vbyte: <Chain Fee Tokens Per VByte Number>
    network: <Network Name String>
    output_script: <Output Script Hex String>
    private_key: <Raw Private Key Hex String>
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
    transaction_vout: <UTXO Transaction Vout Hex String>
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

  if (!args.ecp) {
    throw new Error('ExpectedEcpairObjectToGenerateClaimTransaction');
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

  // Make a new tx that will spend the output back into the wallet
  const tx = new Transaction();

  // The new tx spends the Taproot output
  tx.addInput(txAsHash(args.transaction_id), args.transaction_vout);

  // Set tx locktime
  tx.locktime = bip65Encode({blocks: args.block_height});

  // Set input sequence number for the claim CSV condition
  tx.ins.forEach(n => n.sequence = bip68Encode({blocks: claimBlocksCsv}));

  const {block} = controlBlock({
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
  outputs.forEach(n => tx.addOutput(hexAsBuffer(n.script), n.tokens));

  // Version 2 or higher is required for CSV which is part of the claim script
  tx.version = transactionVersionForCsv;

  // Generate signatures and attach witnesses to the transaction
  tx.ins.forEach((input, vin) => {
    const {witness} = taprootResolutionWitness({
      vin,
      ecp: args.ecp,
      external_key: args.external_key,
      claim_script: args.claim_script,
      output_script: args.output_script,
      private_key: args.private_key,
      script_branches: args.script_branches,
      tokens: args.tokens,
      transaction: tx.toHex(),
      unlock: args.secret,
    });

    return tx.setWitness(vin, witness.map(hexAsBuffer));
  });

  return {transaction: tx.toHex()};
};

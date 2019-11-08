const {address} = require('bitcoinjs-lib');
const bip65Encode = require('bip65').encode;
const {networks} = require('bitcoinjs-lib');
const {Transaction} = require('bitcoinjs-lib');

const estimateTxWeight = require('./estimate_tx_weight');
const {names} = require('./../conf/bitcoinjs-lib');
const witnessForResolution = require('./witness_for_resolution');

const {ceil} = Math;
const hexAsBuf = hex => Buffer.from(hex, 'hex');
const minSequenceValue = 0;
const {toOutputScript} = address;
const txVersion = 2;
const vRatio = 4;

/** Make a claim transaction for a swap

  {
    block_height: <Timelock Block Height Number>
    fee_tokens_per_vbyte: <Fee Per Virtual Byte Token Rate Number>
    network: <Network Name String>
    private_key: <Raw Private Key Hex String>
    secret: <HTLC Preimage Hex String>
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
    transaction: <Raw Transaction Hex String>
  }
*/
module.exports = args => {
  if (!args.block_height) {
    throw new Error('ExpectedBlockHeightForClaimTransaction');
  }

  if (args.fee_tokens_per_vbyte === undefined) {
    throw new Error('ExpectedFeeTokensPerVbyte');
  }

  if (!args.network || !names[args.network]) {
    throw new Error('ExpectedNetworkNameForClaimTransaction');
  }

  if (!args.secret) {
    throw new Error('ExpectedPreimageSecretForClaimTransaction');
  }

  if (!args.private_key) {
    throw new Error('ExpectedPrivateKeyForClaimTransaction');
  }

  if (!args.sweep_address) {
    throw new Error('ExpectedSweepAddressForClaimTransaction');
  }

  if (!args.tokens) {
    throw new Error('ExpectedTokensForClaimTransaction');
  }

  if (!args.transaction_id) {
    throw new Error('ExpectedTransactionIdForClaimTransaction');
  }

  if (args.transaction_vout === undefined) {
    throw new Error('ExpectedTransactionVoutForClaimTransaction');
  }

  if (!args.witness_script) {
    throw new Error('ExpectedWitnessScriptForClaimTransaction');
  }

  const network = networks[names[args.network]];
  const tokensPerVirtualByte = args.fee_tokens_per_vbyte;
  const tx = new Transaction();

  // Add UTXO to tx
  tx.addInput(hexAsBuf(args.transaction_id).reverse(), args.transaction_vout);

  // Add sweep output
  try {
    tx.addOutput(toOutputScript(args.sweep_address, network), args.tokens);
  } catch (err) {
    throw new Error('FailedToAddSweepAddressOutputScript');
  }

  // Set input sequence number
  tx.ins.forEach(n => n.sequence = minSequenceValue);

  // Set tx locktime
  tx.locktime = bip65Encode({blocks: args.block_height});

  // Set tx version
  tx.version = txVersion;

  // Estimate final weight and adjust output down to account for fee
  const {weight} = estimateTxWeight({
    unlock: args.secret,
    weight: tx.weight(),
    witness_script: args.witness_script,
  });

  const fee = tokensPerVirtualByte * ceil(weight / vRatio);

  const [out] = tx.outs;

  // Reduce the sweep output by the fee amount
  out.value = args.tokens - ceil(fee);

  // Set witness
  tx.ins.forEach((input, i) => {
    const {witness} = witnessForResolution({
      private_key: args.private_key,
      tokens: args.tokens,
      transaction: tx.toHex(),
      unlock: args.secret,
      vin: i,
      witness_script: args.witness_script,
    });

    return tx.setWitness(i, witness.map(n => hexAsBuf(n)));
  });

  return {transaction: tx.toHex()};
};

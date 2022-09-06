const {hashForTree} = require('p2tr');
const {pointAdd} = require('tiny-secp256k1');
const {privateAdd} = require('tiny-secp256k1');
const {Transaction} = require('bitcoinjs-lib');
const {v1OutputScript} = require('p2tr');

const taprootClaimOutputs = require('./taproot_claim_outputs');
const taprootResolutionWitness = require('./taproot_resolution_witness');

const bufferAsHex = buffer => buffer.toString('hex');
const {from} = Buffer;
const {fromHex} = Transaction;
const hexAsBuffer = hex => Buffer.from(hex, 'hex');
const {isArray} = Array;
const sequence = 0;
const txAsHash = id => Buffer.from(id, 'hex').reverse();

/** Make a cooperative transaction for a taproot swap

  {
    ecp: <ECPair Object>
    fee_tokens_per_vbyte: <Chain Fee Tokens Per VByte Number>
    network: <Network Name String>
    private_keys: [<Raw Private Key Hex String>]
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
  if (!args.ecp) {
    throw new Error('ExpectedEcpairObjectToGenerateCoopTransaction');
  }

  if (!args.fee_tokens_per_vbyte) {
    throw new Error('ExpectedChainFeeTokensPerVbyteToGenerateTaprootCoopTx');
  }

  if (!args.network) {
    throw new Error('ExpectedNetworkNameToGenerateTaprootCoopTx');
  }

  if (!isArray(args.private_keys)) {
    throw new Error('ExpectedPrivateKeysToGenerateTaprootCoopTransaction');
  }

  if (!isArray(args.script_branches)) {
    throw new Error('ExpectedScriptBranchesToGenerateTaprootCoopTx');
  }

  if (!args.sweep_address) {
    throw new Error('ExpectedSweepAddressToGenerateTaprootCoopTransaction');
  }

  if (!args.tokens) {
    throw new Error('ExpectedUtxoTokensValueToGenerateTaprootCoopTx');
  }

  if (!args.transaction_id) {
    throw new Error('ExpectedTransactionIdToGenerateTaprootCoopTransaction');
  }

  if (args.transaction_vout === undefined) {
    throw new Error('ExpectedTxOutputIndexToGenerateTaprootCoopTransaction');
  }

  const keys = args.private_keys
    .map(n => hexAsBuffer(n))
    .map(n => args.ecp.fromPrivateKey(n));

  const jointPublicKey = pointAdd(...keys.map(n => n.publicKey));
  const privateKeys = keys.map(n => from(n.privateKey));

  const output = v1OutputScript({
    hash: hashForTree({branches: args.script_branches}).hash,
    internal_key: bufferAsHex(from(jointPublicKey)),
  });

  // Make a new tx that will spend the output back into the wallet
  const tx = new Transaction();

  // The new tx spends the Taproot output
  tx.addInput(txAsHash(args.transaction_id), args.transaction_vout, sequence);

  // Calculate outputs to attach
  const {outputs} = taprootClaimOutputs({
    address: args.sweep_address,
    network: args.network,
    rate: args.fee_tokens_per_vbyte,
    sends: args.sends || [],
    script: args.claim_script,
    tokens: args.tokens,
  });

  // Attach all the outputs
  outputs.forEach(n => tx.addOutput(hexAsBuffer(n.script), n.tokens));

  // Generate signatures and attach witnesses to the transaction
  tx.ins.forEach((input, vin) => {
    const {witness} = taprootResolutionWitness({
      vin,
      ecp: args.ecp,
      output_script: output.script,
      private_key: bufferAsHex(from(privateAdd(...privateKeys))),
      script_branches: args.script_branches,
      tokens: args.tokens,
      transaction: tx.toHex(),
    });

    return tx.setWitness(vin, witness.map(hexAsBuffer));
  });

  return {transaction: tx.toHex()};
};

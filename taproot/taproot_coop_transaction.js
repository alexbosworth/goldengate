const {hashForTree} = require('p2tr');
const {pointAdd} = require('tiny-secp256k1');
const {pointFromScalar} = require('tiny-secp256k1');
const {privateAdd} = require('tiny-secp256k1');
const {v1OutputScript} = require('p2tr');

const {encodeTransaction} = require('./../transactions');
const taprootClaimOutputs = require('./taproot_claim_outputs');
const taprootResolutionWitness = require('./taproot_resolution_witness');

const asTx = components => encodeTransaction(components).transaction;
const bufferAsHex = buffer => buffer.toString('hex');
const defaultVersion = 1;
const emptyScript = '';
const {from} = Buffer;
const hexAsBuffer = hex => Buffer.from(hex, 'hex');
const {isArray} = Array;
const isCompressed = true;
const sequence = 0;

/** Make a cooperative transaction for a taproot swap

  {
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

  const privateKeys = args.private_keys.map(n => hexAsBuffer(n));

  const publicKeys = privateKeys.map(n => pointFromScalar(n, isCompressed));

  const jointPublicKey = pointAdd(...publicKeys);

  const output = v1OutputScript({
    hash: hashForTree({branches: args.script_branches}).hash,
    internal_key: bufferAsHex(from(jointPublicKey)),
  });

  // Make a new tx that will spend the Taproot output back into the wallet
  const tx = {
    inputs: [{
      sequence,
      id: args.transaction_id,
      script: emptyScript,
      vout: args.transaction_vout,
    }],
    locktime: Number(),
    outputs: [],
    version: defaultVersion,
  };

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
  outputs.forEach(n => tx.outputs.push({script: n.script, tokens: n.tokens}));

  // Generate signatures and attach witnesses to the transaction
  tx.inputs.forEach((input, vin) => {
    const {witness} = taprootResolutionWitness({
      vin,
      output_script: output.script,
      private_key: bufferAsHex(from(privateAdd(...privateKeys))),
      script_branches: args.script_branches,
      tokens: args.tokens,
      transaction: asTx(tx),
    });

    return input.witness = witness;
  });

  return {transaction: asTx(tx)};
};

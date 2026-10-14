const bip65Encode = require('bip65').encode;
const bip68Encode = require('bip68').encode;
const {outputScriptForAddress} = require('@alexbosworth/blockchain');

const claimOutputs = require('./claim_outputs');
const encodeTransaction = require('./encode_transaction');
const {names} = require('./../conf/networks');
const {versionOfSwapScript} = require('./../script');
const witnessForResolution = require('./witness_for_resolution');

const asTx = components => encodeTransaction(components).transaction;
const blocks = 1;
const emptyScript = '';
const txVersion = 2;

/** Make a claim transaction for a swap

  {
    block_height: <Timelock Block Height Number>
    fee_tokens_per_vbyte: <Fee Per Virtual Byte Token Rate Number>
    network: <Network Name String>
    private_key: <Raw Private Key Hex String>
    secret: <HTLC Preimage Hex String>
    [sends]: [{
      address: <Send to Address String>
      tokens: <Send Tokens Number>
    }]
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

  if (!args.private_key) {
    throw new Error('ExpectedPrivateKeyForClaimTransaction');
  }

  if (!args.secret) {
    throw new Error('ExpectedPreimageSecretForClaimTransaction');
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

  if (!versionOfSwapScript({script: args.witness_script}).version) {
    throw new Error('ExpectedKnownSwapScriptTypeForClaimTransaction');
  }

  const {outputs} = claimOutputs({
    address: args.sweep_address,
    network: args.network,
    rate: args.fee_tokens_per_vbyte,
    sends: !args.sends ? [] : args.sends,
    script: args.witness_script,
    tokens: args.tokens,
  });

  // Spend the UTXO with an input sequence, tx locktime, and tx version
  const tx = {
    inputs: [{
      id: args.transaction_id,
      script: emptyScript,
      sequence: bip68Encode({blocks}),
      vout: args.transaction_vout,
    }],
    locktime: bip65Encode({blocks: args.block_height}),
    outputs: outputs.map(({address, tokens}) => ({
      tokens,
      script: outputScriptForAddress({address, network: args.network}).script,
    })),
    version: txVersion,
  };

  // Set witness
  tx.inputs.forEach((input, i) => {
    const {witness} = witnessForResolution({
      private_key: args.private_key,
      tokens: args.tokens,
      transaction: asTx(tx),
      unlock: args.secret,
      vin: i,
      witness_script: args.witness_script,
    });

    return input.witness = witness;
  });

  return {transaction: asTx(tx)};
};

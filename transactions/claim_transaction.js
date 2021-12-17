const {address} = require('bitcoinjs-lib');
const bip65Encode = require('bip65').encode;
const bip68Encode = require('bip68').encode;
const {networks} = require('bitcoinjs-lib');
const {Transaction} = require('bitcoinjs-lib');

const claimOutputs = require('./claim_outputs');
const {names} = require('./../conf/bitcoinjs-lib');
const {versionOfSwapScript} = require('./../script');
const witnessForResolution = require('./witness_for_resolution');

const blocks = 1;
const hexAsBuf = hex => Buffer.from(hex, 'hex');
const {toOutputScript} = address;
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

  if (!args.ecp) {
    throw new Error('ExpectedEcpObjectForClaimTransaction');
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

  const network = networks[names[args.network]];
  const tx = new Transaction();
  const {version} = versionOfSwapScript({script: args.witness_script});

  // Add UTXO to tx
  tx.addInput(hexAsBuf(args.transaction_id).reverse(), args.transaction_vout);

  const {outputs} = claimOutputs({
    address: args.sweep_address,
    network: args.network,
    rate: args.fee_tokens_per_vbyte,
    sends: !args.sends ? [] : args.sends,
    script: args.witness_script,
    tokens: args.tokens,
  });

  // Setup appropriate outputs
  outputs.forEach(({address, tokens}) => {
    return tx.addOutput(toOutputScript(address, network), tokens);
  });

  // Set input sequence number
  tx.ins.forEach(n => n.sequence = bip68Encode({blocks}));

  // Set tx locktime
  tx.locktime = bip65Encode({blocks: args.block_height});

  // Set tx version
  tx.version = txVersion;

  // Set witness
  tx.ins.forEach((input, i) => {
    const {witness} = witnessForResolution({
      ecp: args.ecp,
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

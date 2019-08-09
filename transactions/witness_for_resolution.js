const {ECPair} = require('bitcoinjs-lib');
const {script} = require('bitcoinjs-lib');
const {Transaction} = require('bitcoinjs-lib');

const encodeSig = script.signature.encode;
const {fromHex} = Transaction;
const hashFlag = Transaction.SIGHASH_ALL;
const hexAsBuffer = hex => Buffer.from(hex, 'hex');

/** Generate signed witnesses for swap resolution transaction

  {
    private_key: <Raw Private Key Hex String>
    tokens: <Tokens Number>
    transaction: <Unsigned Transaction Hex String>
    unlock: <HTLC Preimage or Dummy Byte Hex String>
    vin: <Transaction Input Index Number>
    witness_script: <Witness Script Hex String>
  }

  @throws Error on invalid arguments

  @returns
  {
    witness: [<Witness Stack Hex String>]
  }
*/
module.exports = args => {
  if (!args.private_key) {
    throw new Error('ExpectedPrivateKeyForResolutionTransactionWitness');
  }

  if (!args.tokens) {
    throw new Error('ExpectedTokensForResolutionTransactionWitness')
  }

  if (!args.transaction) {
    throw new Error('ExpectedTransactionForWitnessGeneration');
  }

  try {
    fromHex(args.transaction)
  } catch (err) {
    throw new Error('ExpectedValidTransactionHexForWitnessGeneration');
  }

  if (!args.unlock) {
    throw new Error('ExpectedUnlockElementForResolutionTransactionWitness');
  }

  if (args.vin === undefined) {
    throw new Error('ExpectedInputIndexNumberForResolutionTransactionWitness');
  }

  if (!args.witness_script) {
    throw new Error('ExpectedWitnessScriptForResolutionTransactionWitness');
  }

  const script = hexAsBuffer(args.witness_script);
  const signingKey = ECPair.fromPrivateKey(hexAsBuffer(args.private_key));
  const tx = fromHex(args.transaction);

  if (!tx.ins[args.vin]) {
    throw new Error('ExpectedInputToSignForResolutionTransactionWitness');
  }

  const sigHash = tx.hashForWitnessV0(args.vin, script, args.tokens, hashFlag);

  const sig = encodeSig(signingKey.sign(sigHash), hashFlag);

  return {witness: [sig.toString('hex'), args.unlock, args.witness_script]};
};

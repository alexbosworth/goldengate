const {componentsOfTransaction} = require('@alexbosworth/blockchain');
const {pointFromScalar} = require('tiny-secp256k1');
const {sign} = require('tiny-secp256k1');
const {v0HashToSign} = require('@alexbosworth/blockchain');

const encodeSignature = require('./encode_signature');
const {versionOfSwapScript} = require('./../script');

const bufferAsHex = buffer => Buffer.from(buffer).toString('hex');
const hexAsBuffer = hex => Buffer.from(hex, 'hex');
const isCompressed = true;
const preimageHexLength = 32 * 2;
const sighashAll = 1;

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
    componentsOfTransaction({transaction: args.transaction});
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

  if (!versionOfSwapScript({script: args.witness_script}).version) {
    throw new Error('ExpectedKnownSwapScriptTypeToDeriveResolutionWitness');
  }

  const signingKey = hexAsBuffer(args.private_key);
  const tx = componentsOfTransaction({transaction: args.transaction});
  const {version} = versionOfSwapScript({script: args.witness_script});

  const publicKey = bufferAsHex(pointFromScalar(signingKey, isCompressed));

  if (!tx.inputs[args.vin]) {
    throw new Error('ExpectedInputToSignForResolutionTransactionWitness');
  }

  // The signature commits to the witness script and the spending tokens
  const {hash} = v0HashToSign({
    script: args.witness_script,
    sighash: sighashAll,
    tokens: args.tokens,
    transaction: args.transaction,
    vin: args.vin,
  });

  const signature = Buffer.from(sign(hexAsBuffer(hash), signingKey));

  const {encoded} = encodeSignature({signature, flag: sighashAll});

  const sig = bufferAsHex(encoded);

  switch (version) {
  case 1:
    return {witness: [sig, args.unlock, args.witness_script]};

  default:
    switch (args.unlock.length) {
    case preimageHexLength:
      return {witness: [args.unlock, sig, args.witness_script]};

    default:
      return {witness: [sig, publicKey, args.unlock, args.witness_script]};
    }
  }
};

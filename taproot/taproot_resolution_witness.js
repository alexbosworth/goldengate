const {controlBlock} = require('p2tr');
const {hashForTree} = require('p2tr');
const {leafHash} = require('p2tr');
const {signHash} = require('p2tr');
const {signSchnorr} = require('tiny-secp256k1');
const {Transaction} = require('bitcoinjs-lib');

const bufferAsHex = buffer => buffer.toString('hex');
const defaultSighash = Transaction.SIGHASH_DEFAULT;
const {from} = Buffer;
const {fromHex} = Transaction;
const hexAsBuffer = hex => Buffer.from(hex, 'hex');
const {isArray} = Array;
const leaf = script => !!script ? leafHash({script}).hash : undefined;

/** Generate signed witness stack for Taproot swap resolution transaction

  {
    ecp: <ECPair Object>
    [external_key]: <External Public Key Hex String>
    [claim_script]: <Claim Leaf Script Hex String>
    [internal_key]: <Internal Public Key Hex String>
    output_script: <Spending Output Script Hex String>
    private_key: <Raw Private Key Hex String>
    [refund_script]: <Refund Leaf Script Hex String>
    [script_branches]: [{
      script: <Leaf Script Hex String>
    }]
    tokens: <Spending Tokens Number>
    transaction: <Unsigned Transaction Hex String>
    [unlock]: <HTLC Preimage Hex String>
    vin: <Transaction Input Index Number>
  }

  @throws Error on invalid arguments

  @returns
  {
    witness: [<Witness Stack Hex String>]
  }
*/
module.exports = args => {
  if (!args.ecp) {
    throw new Error('ExpectedEcpToDeriveTaprootResolutionWitness');
  }

  if (!!args.claim_script && !args.external_key) {
    throw new Error('ExpectedExternalKeyToDeriveClaimScriptWitness');
  }

  if (!!args.claim_script && !isArray(args.script_branches)) {
    throw new Error('ExpectedScriptBranchesToDeriveClaimScriptWitness');
  }

  if (!!args.claim_script && !args.unlock) {
    throw new Error('ExpectedUnlockPreimageToDeriveClaimScriptWitness');
  }

  if (!args.output_script) {
    throw new Error('ExpectedSpendingOutpointOutputScriptForTaprootWitness');
  }

  if (!args.private_key) {
    throw new Error('ExpectedSpendingPrivateKeyToGenerateTaprootWitnessStack');
  }

  if (!!args.refund_script && !args.external_key) {
    throw new Error('ExpectedExternalKeyToDeriveRefundScriptWitnessStack');
  }

  if (!!args.refund_script && !isArray(args.script_branches)) {
    throw new Error('ExpectedScriptBranchesToDeriveRefundScriptWitness');
  }

  if (!args.tokens) {
    throw new Error('ExpectedInputTokensValueToDeriveTaprootWitnessStack');
  }

  if (!args.transaction) {
    throw new Error('ExpectedRawTransactionToSignToDeriveTaprootWitnessStack');
  }

  if (args.vin === undefined) {
    throw new Error('ExpectedInputIndexToSignToGenerateResolutionWitness');
  }

  const signingKey = args.ecp.fromPrivateKey(hexAsBuffer(args.private_key));

  const tx = fromHex(args.transaction);

  const witnessScript = args.claim_script || args.refund_script;

  const hashToSign = tx.hashForWitnessV1(
    args.vin,
    [hexAsBuffer(args.output_script)],
    [args.tokens],
    defaultSighash,
    !!witnessScript ? hexAsBuffer(leaf(witnessScript)) : undefined,
  );

  const signature = from(signSchnorr(hashToSign, signingKey.privateKey));

  // Exit early when there is no script path
  if (!witnessScript) {
    const signedInput = signHash({
      hash: hashForTree({branches: args.script_branches}).hash,
      private_key: args.private_key,
      public_key: bufferAsHex(signingKey.publicKey),
      sign_hash: bufferAsHex(hashToSign),
    });

    return {witness: [signedInput.signature]};
  }

  // Create the control block proving the witness script is part of the output
  const {block} = controlBlock({
    external_key: args.external_key,
    internal_key: args.internal_key,
    leaf_script: witnessScript,
    script_branches: args.script_branches,
  });

  // The witness stack optionally includes an unlock preimage for claim path
  const witness = [
    args.unlock,
    bufferAsHex(signature),
    witnessScript,
    block,
  ];

  return {witness: witness.filter(n => !!n)};
};

const {ECPair} = require('bitcoinjs-lib');
const {script} = require('bitcoinjs-lib');
const {Transaction} = require('bitcoinjs-lib');

const encodeSig = script.signature.encode;
const {fromHex} = Transaction;
const hexAsBuffer = hex => Buffer.from(hex, 'hex');
const {isArray} = Array;
const {SIGHASH_ALL} = Transaction;

/** Generate signed witnesses for claim transaction

  {
    private_key: <Raw Private Key Hex String>
    secret: <HTLC Preimage or Public Key or Dummy Byte Hex String>
    transaction: <Unsigned Transaction Hex String>
    utxos: [{
      redeem: <Redeem Script Hex String>
      tokens: <Spending Outpoint Tokens Value Number>
    }]
  }

  @throws Error on invalid arguments

  @returns
  {
    witnesses: [<Witness Stack Hex String>]
  }
*/
module.exports = args => {
  if (!args.private_key) {
    throw new Error('ExpectedPrivateKeyForClaimTransactionWitnesses');
  }

  if (!args.secret) {
    throw new Error('ExpectedSecretForClaimTransactionWitnesses');
  }

  if (!args.transaction) {
    throw new Error('ExpectedTransactionForWitnessGeneration');
  }

  if (!isArray(args.utxos)) {
    throw new Error('ExpectedWitnessUtxosForClaimWitnesses');
  }

  if (!!args.utxos.find(n => !n.redeem)) {
    throw new Error('ExpectedRedeemScriptForClaimWitnesses');
  }

  if (!!args.utxos.find(n => !n.tokens)) {
    throw new Error('ExpectedTokensForClaimWitnesses');
  }

  const signingKey = ECPair.fromPrivateKey(hexAsBuffer(args.private_key));
  const tx = fromHex(args.transaction);

  const witnesses = args.utxos.map(({redeem, tokens}, vin) => {
    const script = hexAsBuffer(redeem);

    const sigHash = tx.hashForWitnessV0(vin, script, tokens, SIGHASH_ALL);

    const signature = encodeSig(signingKey.sign(sigHash), SIGHASH_ALL);

    return [signature.toString('hex'), args.secret, redeem];
  });

  return {witnesses};
};

const {createHash} = require('crypto');

const bip65Encode = require('bip65').encode;
const {OP_CHECKLOCKTIMEVERIFY} = require('bitcoin-ops');
const {OP_CHECKSIG} = require('bitcoin-ops');
const {OP_DROP} = require('bitcoin-ops');
const {OP_ELSE} = require('bitcoin-ops');
const {OP_ENDIF} = require('bitcoin-ops');
const {OP_EQUAL} = require('bitcoin-ops');
const {OP_EQUALVERIFY} = require('bitcoin-ops');
const {OP_HASH160} = require('bitcoin-ops');
const {OP_IF} = require('bitcoin-ops');
const {OP_SIZE} = require('bitcoin-ops');
const {scriptElementsAsScript} = require('@alexbosworth/blockchain');

const encodeScriptNumber = require('./encode_script_number');
const getPublicKey = require('./get_public_key');

const encodeNumber = number => encodeScriptNumber({number}).encoded;
const hexAsBuffer = hex => Buffer.from(hex, 'hex');
const pubKey = key => getPublicKey({private_key: key}).public_key;
const ripemd160 = buffer => createHash('ripemd160').update(buffer).digest();
const sha256 = preimage => createHash('sha256').update(preimage).digest('hex');

/** Get swap redeem script / witness program

  // A hash or secret is required
  // A private key or public key is required

  {
    [claim_private_key]: <Claim Private Key Hex String>
    [claim_public_key]: <Claim Public Key Hex String>
    [hash]: <Preimage Hash Hex String>
    [refund_private_key]: <Refund Private Key Hex String>
    [refund_public_key]: <Refund Public Key Hex String>
    [secret]: <Preimage Hex String>
    timeout: <CLTV Timeout Height Number>
  }

  @throws
  <Error> on a script generation error

  @returns
  {
    script: <Hex Serialized Witness Script String>
  }
*/
module.exports = args => {
  if (!args.claim_private_key && !args.claim_public_key) {
    throw new Error('ExpectedEitherPrivateKeyOrPublicKeyForSwapScript');
  }

  if (!args.hash && !args.secret) {
    throw new Error('ExpectedEitherHashOrSecretForSwapScript');
  }

  if (!args.refund_private_key && !args.refund_public_key) {
    throw new Error('ExpectedRefundPublicOrPrivateKeyForSwapScript');
  }

  if (!args.timeout) {
    throw new Error('ExpectedSwapTimeoutExpirationCltvForSwapScript');
  }

  const claimPrivKey = args.claim_private_key;
  const hash = args.hash || sha256(hexAsBuffer(args.secret));
  const refundPrivKey = args.refund_private_key;

  const swapHash = hexAsBuffer(hash);

  try {
    const cltv = encodeNumber(bip65Encode({blocks: args.timeout}));

    const elements = [
      OP_SIZE, encodeNumber(swapHash.length), OP_EQUAL,
      OP_IF,
        OP_HASH160, ripemd160(swapHash), OP_EQUALVERIFY,
        hexAsBuffer(args.claim_public_key || pubKey(claimPrivKey)),
      OP_ELSE,
        OP_DROP,
        cltv, OP_CHECKLOCKTIMEVERIFY, OP_DROP,
        hexAsBuffer(args.refund_public_key || pubKey(refundPrivKey)),
      OP_ENDIF,
      OP_CHECKSIG,
    ];

    const {script} = scriptElementsAsScript({elements});

    return {script};
  } catch (err) {
    throw Error('FailedToComposeSwapScriptElements');
  }
};

const {createHash} = require('crypto');

const bip65Encode = require('bip65').encode;
const {OP_1} = require('bitcoin-ops');
const {OP_CHECKLOCKTIMEVERIFY} = require('bitcoin-ops');
const {OP_CHECKSEQUENCEVERIFY} = require('bitcoin-ops');
const {OP_CHECKSIGVERIFY} = require('bitcoin-ops');
const {OP_EQUALVERIFY} = require('bitcoin-ops');
const {OP_HASH160} = require('bitcoin-ops');
const {OP_SIZE} = require('bitcoin-ops');
const {scriptElementsAsScript} = require('@alexbosworth/blockchain');

const encodeScriptNumber = require('./encode_script_number');
const getPublicKey = require('./get_public_key');

const encodeNumber = number => encodeScriptNumber({number}).encoded;
const hexAsBuffer = hex => !!hex ? Buffer.from(hex, 'hex') : undefined;
const pubKey = key => getPublicKey({private_key: key}).public_key;
const ripemd160 = buffer => createHash('ripemd160').update(buffer).digest();
const sha256 = preimage => createHash('sha256').update(preimage).digest('hex');
const shortKey = hexPublicKey => hexPublicKey.slice(2);

/** Get swap script branches for a Taproot spend

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
    branches: [{
      script: <Hex Serialized Witness Script String>
    }]
    claim: <Claim Script Hex String>
    hash: <Swap Hash Hex String>
    refund: <Refund Script Hex String>
  }
*/
module.exports = args => {
  if (!args.claim_private_key && !args.claim_public_key) {
    throw new Error('ExpectedEitherPrivateKeyOrPublicKeyForSwapBranches');
  }

  if (!args.hash && !args.secret) {
    throw new Error('ExpectedEitherHashOrSecretForSwapScriptBranches');
  }

  if (!args.refund_private_key && !args.refund_public_key) {
    throw new Error('ExpectedRefundPublicOrPrivateKeyForSwapScriptBranches');
  }

  if (!args.timeout) {
    throw new Error('ExpectedSwapTimeoutExpirationCltvForSwapScriptBranches');
  }

  const claimPrivKey = hexAsBuffer(args.claim_private_key);
  const hash = args.hash || sha256(hexAsBuffer(args.secret));
  const refundPrivKey = hexAsBuffer(args.refund_private_key);

  const swapHash = hexAsBuffer(hash);

  try {
    const cltv = encodeNumber(bip65Encode({blocks: args.timeout}));

    const claim = args.claim_public_key || pubKey(claimPrivKey);
    const refund = args.refund_public_key || pubKey(refundPrivKey);

    const claimElements = [
      hexAsBuffer(shortKey(claim)), OP_CHECKSIGVERIFY,
      OP_SIZE, encodeNumber(swapHash.length),
      OP_EQUALVERIFY,
      OP_HASH160, ripemd160(swapHash), OP_EQUALVERIFY,
      OP_1,
      OP_CHECKSEQUENCEVERIFY,
    ];

    const refundElements = [
      hexAsBuffer(shortKey(refund)), OP_CHECKSIGVERIFY,
      cltv, OP_CHECKLOCKTIMEVERIFY,
    ];

    const claimLeaf = scriptElementsAsScript({elements: claimElements});
    const refundLeaf = scriptElementsAsScript({elements: refundElements});

    return {
      hash,
      claim: claimLeaf.script,
      branches: [claimLeaf, refundLeaf],
      refund: refundLeaf.script,
    };
  } catch (err) {
    throw Error('FailedToComposeSwapScriptBranchElements');
  }
};

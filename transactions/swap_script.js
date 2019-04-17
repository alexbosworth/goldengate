const {createHash} = require('crypto');

const bip65Encode = require('bip65').encode;
const {crypto} = require('bitcoinjs-lib');
const {ECPair} = require('bitcoinjs-lib');
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
const pushdataEncode = require('pushdata-bitcoin').encode;
const pushdataEncodingLen = require('pushdata-bitcoin').encodingLength;
const {script} = require('bitcoinjs-lib');

const scriptElementsAsScript = require('./script_elements_as_script');

const encodeNumber = script.number.encode;
const hexAsBuffer = hex => Buffer.from(hex, 'hex');
const {ripemd160} = crypto;
const sha256 = preimage => createHash('sha256').update(preimage).digest('hex');

/** Get swap redeem script / witness program

  // A hash or secret is required
  // A private key or public key is required

  {
    [hash]: <Preimage Hash Hex String>
    [private_key]: <Private Key Hex String>
    [public_key]: <Public Key Hex String>
    [secret]: <Preimage Hex String>
    service_public_key: <Service Public Key Hex String>
    timeout: <CLTV Timeout Height Number>
  }

  @throws
  <Error> on a script generation error

  @returns
  {
    script: <Hex Serialized Redeem Script String>
  }
*/
module.exports = args => {
  if (!args.hash && !args.secret) {
    throw new Error('ExpectedEitherHashOrSecretForSwapScript');
  }

  if (!!args.hash && !!args.secret) {
    throw new Error('ExpectedOnlyHashOrSecretForSwapScript');
  }

  if (!args.private_key && !args.public_key) {
    throw new Error('ExpectedEitherPrivateKeyOrPublicKeyForSwapScript');
  }

  if (!!args.private_key && !!args.public_key) {
    throw new Error('ExpectedOnlyPrivateKeyOrPublicKeyForSwapScript');
  }

  if (!args.service_public_key) {
    throw new Error('ExpectedServicePublicKeyForSwapScript');
  }

  if (!args.timeout) {
    throw new Error('ExpectedSwapTimeoutExpirationCltvForSwapScript');
  }

  const cltv = encodeNumber(bip65Encode({blocks: args.timeout}));
  const hash = args.hash || sha256(hexAsBuffer(args.secret));
  const privateKey = !args.private_key ? null : hexAsBuffer(args.private_key);
  const refundPublicKey = hexAsBuffer(args.service_public_key);

  const keyPair = !privateKey ? null : ECPair.fromPrivateKey(privateKey);
  const swapHash = hexAsBuffer(hash);

  const publicKey = args.public_key || keyPair.publicKey.toString('hex');

  const destinationPublicKey = hexAsBuffer(publicKey);

  const elements = [
    OP_SIZE, encodeNumber(swapHash.length), OP_EQUAL,
    OP_IF,
      OP_HASH160, ripemd160(swapHash), OP_EQUALVERIFY,
      destinationPublicKey,
    OP_ELSE,
      OP_DROP,
      cltv, OP_CHECKLOCKTIMEVERIFY, OP_DROP,
      refundPublicKey,
    OP_ENDIF,
    OP_CHECKSIG,
  ];

  try {
    const {script} = scriptElementsAsScript({elements});

    return {script};
  } catch (err) {
    throw Error('FailedToComposeSwapScriptElements');
  }
};

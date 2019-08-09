const {ECPair} = require('bitcoinjs-lib');

const {addressForScript} = require('./../script');
const {swapScript} = require('./../script');

/** Swap In Address

  {
    hash: <Swap Hash Hex String>
    network: <Network Name String>
    refund_private_key: <Refund Private Key Hex String>
    service_public_key: <Swap Service Public Key Hex String>
    timeout_height: <Timeout Height Number>
  }

  @throws
  <Error>

  @returns
  {
    nested: <Nested Address String>
  }
*/
module.exports = args => {
  if (!args.hash) {
    throw new Error('ExpectedSwapHashForSwapInAddress');
  }

  if (!args.network) {
    throw new Error('ExpectedNetworkNameForSwapInAddress');
  }

  if (!args.refund_private_key) {
    throw new Error('ExpectedRefundPrivateKeyForSwapInAddress');
  }

  if (!args.service_public_key) {
    throw new Error('ExpectedServicePublicKeyForSwapInAddress');
  }

  if (!args.timeout_height) {
    throw new Error('ExpectedTimeoutHeightForSwapInAddress');
  }

  const refundKey = Buffer.from(args.refund_private_key, 'hex');

  const {publicKey} = ECPair.fromPrivateKey(refundKey);

  try {
    const {script} = swapScript({
      claim_public_key: args.service_public_key,
      hash: args.hash,
      refund_public_key: publicKey.toString('hex'),
      timeout: args.timeout_height,
    });

    const {nested} = addressForScript({script, network: args.network});

    return {nested};
  } catch (err) {
    throw new Error('FailedToDeriveSwapAddressForSwapInAddress');
  }
};

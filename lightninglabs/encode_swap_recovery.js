const {encode} = require('cbor');

/** Encode recovery blob

  Either a private key or public key is required for claim/refund
  Either the secret preimage or the preimage hash is required for claim/refund 

  {
    [claim_private_key]: <Claim Private Key Hex String>
    [claim_public_key]: <Claim Public Key Hex String>
    [execution_id]: <Swap Execution Id Hex String>
    [id]: <Preimage Hash Hex String>
    [refund_private_key]: <Refund Private Key Hex String>
    [refund_public_key]: <Refund Public Key Hex String>
    [secret]: <Preimage Secret Hex String>
    start_height: <Start Height Number>
    [sweep_address]: <Sweep Address String>
    timeout: <Swap Timeout Height Number>
    tokens: <Swap Tokens Number>
  }

  @throws
  <Error>

  @returns
  {
    recovery: <Recovery CBOR Blob Hex String>
  }
*/
module.exports = args => {
  if (!args.claim_private_key && !args.claim_public_key) {
    throw new Error('ExpectedClaimKeyToEncodeSwapRecovery');
  }

  if (!!args.claim_private_key && !args.refund_public_key) {
    throw new Error('ExpectedRefundPublicKeyToEncodeClaimRecovery');
  }

  if (!args.claim_public_key && !!args.refund_private_key) {
    throw new Error('ExpectedClaimPublicKeyToEncodeRefundRecovery');
  }

  if (!args.execution_id && !!args.secret) {
    throw new Error('ExpectedSwapHashHexStringToEncodeRecovery');
  }

  if (!args.refund_private_key && !args.refund_public_key) {
    throw new Error('ExpectedRefundKeyToEncodeSwapRecovery');
  }

  if (!args.secret && !!args.claim_private_key) {
    throw new Error('ExpectedClaimSecretToEncodeClaimRecovery');
  }

  if (!args.start_height) {
    throw new Error('ExpectedSwapStartHeightToEncodeSwapRecovery');
  }

  if (!args.timeout) {
    throw new Error('ExpectedSwapTimeoutToEncodeSwapRecovery');
  }

  if (!args.tokens) {
    throw new Error('ExpectedSwapTokensToEncodeSwapRecovery');
  }

  const recovery = encode({
    claim_private_key: args.claim_private_key || undefined,
    claim_public_key: args.claim_public_key || undefined,
    execution_id: args.execution_id || undefined,
    id: args.id || undefined,
    refund_private_key: args.refund_private_key || undefined,
    refund_public_key: args.refund_public_key || undefined,
    secret: args.secret || undefined,
    start_height: args.start_height,
    sweep_address: args.sweep_address || undefined,
    timeout: args.timeout,
    tokens: args.tokens,
  });

  return {recovery: recovery.toString('hex')};
};

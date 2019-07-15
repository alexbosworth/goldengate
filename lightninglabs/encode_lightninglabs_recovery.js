const {encode} = require('cbor');

/** Encode recovery blob

  {
    execution_id: <Execution Id Hex String>
    private_key: <Recovery Raw Private Key Hex String>
    script: <Swap Witness Program / Redeem Script Hex String>
    secret: <Preimage Secret Hex String>
    start_height: <Start Height Number>
    [sweep_address]: <Sweep Address String>
    timeout: <Timeout Number>
    tokens: <Recover Tokens Number>
  }

  @throws
  <Error>

  @returns
  {
    recovery: <Recovery Cbor Blob Hex String>
  }
*/
module.exports = args => {
  if (!args.execution_id) {
    throw new Error('ExpectedExecutionIdToEncodeRecovery');
  }

  if (!args.private_key) {
    throw new Error('ExpectedPrivateKeyToEncodeRecovery');
  }

  if (!args.script) {
    throw new Error('ExpectedSwapScriptToEncodeRecovery');
  }

  if (!args.secret) {
    throw new Error('ExpectedSwapSecretToEncodeRecovery');
  }

  if (!args.start_height) {
    throw new Error('ExpectedStartHeightToEncodeRecovery');
  }

  if (!args.timeout) {
    throw new Error('ExpectedSwapTimeoutHeightToEncodeRecovery');
  }

  if (!args.tokens) {
    throw new Error('ExpectedSwapTokensToEncodeRecovery');
  }

  const recovery = encode({
    execution_id: args.execution_id,
    private_key: args.private_key,
    script: args.script,
    secret: args.secret,
    start_height: args.start_height,
    sweep_address: args.sweep_address || undefined,
    timeout: args.timeout,
    tokens: args.tokens,
  });

  return {recovery: recovery.toString('hex')};
};

const {decodeFirst} = require('cbor');

/** Decode encoded swap recovery blob

  {
    recovery: <Raw Recovery Hex String>
  }

  @returns via cbk
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
*/
module.exports = ({recovery}, cbk) => {
  if (!recovery) {
    return cbk([400, 'ExpectedRecoveryHexStringToDecode']);
  }

  return decodeFirst(Buffer.from(recovery, 'hex'), (err, recover) => {
    if (!!err) {
      return cbk([400, 'ExpectedValidCborEncodedRecoverData', {err}]);
    }

    if (!recover) {
      return cbk([400, 'ExpectedRecoverObjectWhenDecodingRecoveryBlob']);
    }

    if (!recover.execution_id) {
      return cbk([400, 'ExpectedEncodedExecutionIdInRecoveryBlob']);
    }

    if (!recover.private_key) {
      return cbk([400, 'ExpectedEncodedPrivateKeyInRecoveryBlob']);
    }

    if (!recover.script) {
      return cbk([400, 'ExpectedEncodedSwapScriptInRecoveryBlob']);
    }

    if (!recover.secret) {
      return cbk([400, 'ExpectedEncodedPreimageSecretInRecoveryBlob']);
    }

    if (!recover.start_height) {
      return cbk([400, 'ExpectedEncodedRecoveryStartHeightInRecoveryBlob']);
    }

    if (!recover.timeout) {
      return cbk([400, 'ExpectedEncodedRecoverySwapTimeoutInRecoveryBlob']);
    }

    if (!recover.tokens) {
      return cbk([400, 'ExpectedEncodedRecoverySwapTokensInRecoveryBlob']);
    }

    return cbk(null, {
      execution_id: recover.execution_id,
      private_key: recover.private_key,
      script: recover.script,
      secret: recover.secret,
      start_height: recover.start_height,
      sweep_address: recover.sweep_address || undefined,
      timeout: recover.timeout,
      tokens: recover.tokens,
    });
  });
};

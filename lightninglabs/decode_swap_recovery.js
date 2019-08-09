const asyncAuto = require('async/auto');
const {decodeFirst} = require('cbor');
const {returnResult} = require('asyncjs-util');

const encodeSwapRecovery = require('./encode_swap_recovery');
const {swapScript} = require('./../script');

/** Decode encoded swap recovery blob

  {
    recovery: <Raw Recovery Hex String>
  }

  @returns via cbk or Promise
  {
    [claim_private_key]: <Claim Private Key Hex String>
    [claim_public_key]: <Claim Public Key Hex String>
    [execution_id]: <Swap Execution Id Hex String>
    [id]: <Swap Funding Payment Id Hex String>
    [refund_private_key]: <Refund Private Key Hex String>
    [refund_public_key]: <Refund Public Key Hex String>
    script: <Swap Script Hex String>
    [secret]: <Preimage Secret Hex String>
    start_height: <Start Height Number>
    [sweep_address]: <Sweep Address String>
    timeout: <Swap Timeout Height Number>
    tokens: <Swap Tokens Number>
  }
*/
module.exports = ({recovery}, cbk) => {
  return new Promise((resolve, reject) => {
    return asyncAuto({
      // Check arguments
      validate: cbk => {
        if (!recovery) {
          return cbk([400, 'ExpectedRecoveryHexStringToDecode']);
        }

        return cbk();
      },

      // Decode recover hex blob
      recovery: ['validate', ({}, cbk) => {
        return decodeFirst(Buffer.from(recovery, 'hex'), (err, recover) => {
          if (!!err) {
            return cbk([400, 'ExpectedValidCborEncodedRecoverData', {err}]);
          }

          return cbk(null, recover);
        });
      }],

      // Derive swap script from components
      script: ['recovery', ({recovery}, cbk) => {
        try {
          const {script} = swapScript({
            claim_private_key: recovery.claim_private_key || undefined,
            claim_public_key: recovery.claim_public_key || undefined,
            hash: recovery.id || undefined,
            refund_private_key: recovery.refund_private_key || undefined,
            refund_public_key: recovery.refund_public_key || undefined,
            secret: recovery.secret || undefined,
            timeout: recovery.timeout,
          });

          return cbk(null, {
            script,
            claim_private_key: recovery.claim_private_key,
            claim_public_key: recovery.claim_public_key,
            execution_id: recovery.execution_id,
            id: recovery.id,
            refund_private_key: recovery.refund_private_key,
            refund_public_key: recovery.refund_public_key,
            secret: recovery.secret,
            start_height: recovery.start_height,
            sweep_address: recovery.sweep_address,
            timeout: recovery.timeout,
            tokens: recovery.tokens,
          });
        } catch (err) {
          return cbk([400, 'ExpectedValidRecoveryDetails', {err}]);
        }
      }],

      // Check recovery
      checkRecovery: ['recovery', ({recovery}, cbk) => {
        try {
          encodeSwapRecovery({
            claim_private_key: recovery.claim_private_key,
            claim_public_key: recovery.claim_public_key,
            execution_id: recovery.execution_id,
            refund_private_key: recovery.refund_private_key,
            refund_public_key: recovery.refund_public_key,
            secret: recovery.secret,
            start_height: recovery.start_height,
            sweep_address: recovery.sweep_address,
            timeout: recovery.timeout,
            tokens: recovery.tokens,
          });

          return cbk();
        } catch (err) {
          return cbk([400, 'ExpectedValidSwapRecoveryToDecode', {err}]);
        }
      }],
    },
    returnResult({reject, resolve, of: 'script'}, cbk));
  });
};

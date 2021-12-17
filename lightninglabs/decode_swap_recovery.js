const asyncAuto = require('async/auto');
const {decodeFirst} = require('cbor');
const {ECPair} = require('ecpair');
const {returnResult} = require('asyncjs-util');
const tinysecp = require('tiny-secp256k1');

const encodeSwapRecovery = require('./encode_swap_recovery');
const {swapScript} = require('./../script');
const {swapScriptV2} = require('./../script');

const scriptVersion1 = undefined;
const scriptVersion2 = 2;

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
    [version]: <Swap Script Version Number>
  }
*/
module.exports = ({recovery}, cbk) => {
  return new Promise((resolve, reject) => {
    return asyncAuto({
      // Import ECPair library
      ecp: async () => (await import('ecpair')).ECPairFactory(tinysecp),

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

      // Script details
      scriptDetails: ['ecp', 'recovery', ({ecp, recovery}, cbk) => {
        return cbk(null, {
          ecp,
          claim_private_key: recovery.claim_private_key || undefined,
          claim_public_key: recovery.claim_public_key || undefined,
          hash: recovery.id || undefined,
          refund_private_key: recovery.refund_private_key || undefined,
          refund_public_key: recovery.refund_public_key || undefined,
          secret: recovery.secret || undefined,
          timeout: recovery.timeout,
          version: recovery.version,
        });
      }],

      // Derive swap script from components
      deriveScript: ['scriptDetails', ({scriptDetails}, cbk) => {
        try {
          switch (scriptDetails.version) {
          case scriptVersion1:
            return cbk(null, swapScript(scriptDetails));

          case scriptVersion2:
            return cbk(null, swapScriptV2(scriptDetails));

          default:
            return cbk([400, 'UnrecognizedSwapVersionNumber']);
          }
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
            version: recovery.version,
          });

          return cbk();
        } catch (err) {
          return cbk([400, 'ExpectedValidSwapRecoveryToDecode', {err}]);
        }
      }],

      // Final decoded result
      decoded: [
        'deriveScript',
        'recovery',
        ({deriveScript, recovery}, cbk) =>
      {
        return cbk(null, {
          claim_private_key: recovery.claim_private_key,
          claim_public_key: recovery.claim_public_key,
          execution_id: recovery.execution_id,
          id: recovery.id,
          refund_private_key: recovery.refund_private_key,
          refund_public_key: recovery.refund_public_key,
          script: deriveScript.script,
          secret: recovery.secret,
          start_height: recovery.start_height,
          sweep_address: recovery.sweep_address,
          timeout: recovery.timeout,
          tokens: recovery.tokens,
          version: recovery.version,
        });
      }],
    },
    returnResult({reject, resolve, of: 'decoded'}, cbk));
  });
};

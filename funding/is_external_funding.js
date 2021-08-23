const asyncAuto = require('async/auto');
const asyncEach = require('async/each');
const asyncReflect = require('async/reflect');
const {fundPsbt} = require('ln-service');
const {getWalletVersion} = require('ln-service');
const {returnResult} = require('asyncjs-util');
const {unlockUtxo} = require('ln-service');

const {isArray} = Array;
const noInternalFundingVersions = ['0.11.0-beta', '0.11.1-beta'];
const slowConfirmationTarget = 1000;

/** Determine if funding should be done internally or externally

  {
    ask: <Inquirer Ask Function>
    lnd: <Authenticated LND API Object>
    outputs: [{
      address: <Chain Address To Send To String>
      tokens: <Amount of Tokens To Send Number>
    }]
  }

  @returns via cbk or Promise
  {
    is_external: <Use External Funding Bool>
  }
*/
module.exports = ({ask, lnd, outputs}, cbk) => {
  return new Promise((resolve, reject) => {
    return asyncAuto({
      // Check arguments
      validate: cbk => {
        if (!ask) {
          return cbk([400, 'ExpectedAskFunctionToDetermineExternalFunding']);
        }

        if (!lnd) {
          return cbk([400, 'ExpectedLndToDetermineExternalFunding']);
        }

        if (!isArray(outputs)) {
          return cbk([400, 'ExpectedTxOutputsToDetermineExternalFunding']);
        }

        return cbk();
      },

      // Get the wallet version to make sure internal funding is supported
      getWalletVersion: ['validate', ({}, cbk) => {
        return getWalletVersion({lnd}, cbk);
      }],

      // Deterrmine if the wallet version is too old for internal funding
      isInternalSupported: ['getWalletVersion', ({getWalletVersion}, cbk) => {
        // Early versions of LND do not support internal PSBT funding
        if (noInternalFundingVersions.includes(getWalletVersion.version)) {
          return cbk(null, false);
        }

        return cbk(null, true);
      }],

      // Try funding the outputs with a low confirmation target
      attemptFunding: [
        'isInternalSupported',
        asyncReflect(({isInternalSupported}, cbk) =>
      {
        // Exit early when the funding API isn't supported
        if (!isInternalSupported) {
          return cbk();
        }

        return fundPsbt({
          lnd,
          outputs,
          target_confirmations: slowConfirmationTarget,
        },
        cbk);
      })],

      // Determine if internal funding should really be used
      confirmInternal: ['attemptFunding', ({attemptFunding}, cbk) => {
        // Exit early when internal funds are not an option for funding
        if (!attemptFunding.value) {
          return cbk();
        }

        // Prompt to make sure that internal funding should really be used
        return ask({
          default: true,
          message: 'Use internal wallet funds?',
          name: 'internal',
          type: 'confirm',
        },
        ({internal}) => cbk(null, internal));
      }],

      // Undo the test funding lock
      unlockFunding: ['attemptFunding', ({attemptFunding}, cbk) => {
        // Exit early when there are no locks to unlock
        if (!attemptFunding.value || !!attemptFunding.error) {
          return cbk();
        }

        const locks = attemptFunding.value.inputs.filter(n => !!n.lock_id);

        // Release all of the funding locks
        return asyncEach(locks, (input, cbk) => {
          return unlockUtxo({
            lnd,
            id: input.lock_id,
            transaction_id: input.transaction_id,
            transaction_vout: input.transaction_vout,
          },
          cbk);
        },
        cbk);
      }],

      // Check if the user wants to use internal funding or not
      isExternal: ['confirmInternal', ({confirmInternal}, cbk) => {
        // Unless the user opts in to an internal funding, use external funds
        return cbk(null, {is_external: confirmInternal !== true});
      }],
    },
    returnResult({reject, resolve, of: 'isExternal'}, cbk));
  });
};

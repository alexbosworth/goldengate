const asyncAuto = require('async/auto');
const asyncEach = require('async/each');
const asyncUntil = require('async/until');
const {getChainTransactions} = require('ln-service');
const {getHeight} = require('ln-service');
const {lockUtxo} = require('ln-service');
const {returnResult} = require('asyncjs-util');

const asOutpoint = n => `${n.transaction_id}:${n.transaction_vout}`;
const blockHeightBuffer = 144;
const currentDate = () => new Date().toISOString();
const {isArray} = Array;
const {max} = Math;

/** Keep input locks alive while related transaction is not yet confirmed

  {
    id: <Transaction Id Hex String>
    inputs: [{
      [lock_expires_at]: <UTXO Lock Expires At ISO 8601 Date String>
      transaction_id: <Unspent Transaction Id Hex String>
      transaction_vout: <Unspent Transaction Output Index Number>
    }]
    interval: <Relock Interval Milliseconds>
    lnd: <Authenticated LND API Object>
  }

  @returns via cbk or Promise
*/
module.exports = ({id, inputs, interval, lnd}, cbk) => {
  return new Promise((resolve, reject) => {
    return asyncAuto({
      // Check arguments
      validate: cbk => {
        if (!id) {
          return cbk([400, 'ExpectedTransactionIdToMaintainUtxoLocks']);
        }

        if (!isArray(inputs)) {
          return cbk([400, 'ExpectedArrayOfInputsToMaintainUtxoLocks']);
        }

        if (!interval) {
          return cbk([400, 'ExpectedRelockIntervalToMaintainUtxoLocks']);
        }

        if (!lnd) {
          return cbk([400, 'ExpectedAuthenticatedLndTomaintainUtxoLocks']);
        }

        return cbk();
      },

      // Get the starting height to avoid pulling too many chain transactions
      getHeight: ['validate', ({}, cbk) => getHeight({lnd}, cbk)],

      // Wait for the transaction to become confirmed
      unlockWhenConfirmed: ['getHeight', ({getHeight}, cbk) => {
        const after = getHeight.current_block_height - blockHeightBuffer;
        const locks = {};

        return asyncUntil(
          // Stop when the transaction is confirmed
          cbk => {
            return getChainTransactions({after, lnd}, (err, res) => {
              if (!!err) {
                return cbk();
              }

              const tx = res.transactions.find(n => n.id === id);

              return cbk(null, !!tx && tx.is_confirmed);
            });
          },
          // Lock all the inputs to extend their lock timers
          cbk => {
            return asyncEach(inputs, (input, cbk) => {
              const lock = locks[asOutpoint(input)] || {
                lock_expires_at: input.lock_expires_at,
              };

              const expiry = new Date(lock.lock_expires_at || currentDate());

              // Wait until the lock expires
              return setTimeout(() => {
                return lockUtxo({
                  lnd,
                  id: lock.lock_id,
                  transaction_id: input.transaction_id,
                  transaction_vout: input.transaction_vout,
                },
                (err, res) => {
                  // Exit early and ignore errors on lock attempt
                  if (!!err) {
                    return cbk();
                  }

                  // Update the outpoint lock
                  locks[asOutpoint(input)] = {
                    lock_expires_at: res.expires_at,
                    lock_id: res.id,
                  };

                  return cbk();
                });
              },
              max(expiry - new Date(), Number()));
            },
            () => {
              return setTimeout(cbk, interval);
            });
          },
          // All input transactions were confirmed
          cbk
        )
      }],
    },
    returnResult({reject, resolve}, cbk));
  });
};

const asyncAuto = require('async/auto');
const asyncify = require('async/asyncify');
const {returnResult} = require('asyncjs-util');

const addressForScript = require('./address_for_script');

/** Make an address for a script

  {
    network: <Network Name String>
    script: <Witness Script Hex String>
  }

  @returns via cbk or Promise
  {
    address: <Native Witness Address String>
    nested: <Nested Witness Address String>
  }
*/
module.exports = ({network, script}, cbk) => {
  return new Promise((resolve, reject) => {
    return asyncAuto({
      // Address
      address: asyncify(() => {
        try {
          const {address, nested} = addressForScript({network, script});

          return {address, nested};
        } catch (err) {
          throw [400, 'FailedToDeriveSwapScript', {err}];
        }
      }),
    },
    returnResult({reject, resolve, of: 'address'}, cbk));
  });
};

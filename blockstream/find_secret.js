const asyncAuto = require('async/auto');
const {crypto} = require('bitcoinjs-lib');
const {returnResult} = require('asyncjs-util');

const {apis} = require('./conf/blockstream-info');
const getTxsFromBlockstream = require('./get_txs_from_blockstream');

const {isArray} = Array;
const flatten = arr => [].concat(...arr);  
const secretHexLength = Buffer.alloc(32).toString('hex').length;
const sha256 = hexPreimage => crypto.sha256(Buffer.from(hexPreimage, 'hex'));

/** Find a preimage used to sweep an HTLC

  {
    address: <Address String>
    hash: <Hash Hex String>
    network: <Network Name String>
    request: <Request Function>
  }

  @returns via cbk or Promise
  {
    ids: [<Transaction Id Hex String>]
    [secret]: <Secret Hex String>
  }
*/
module.exports = ({address, hash, network, request}, cbk) => {
  return new Promise((resolve, reject) => {
    return asyncAuto({
      // Check arguments
      validate: cbk => {
        if (!address) {
          return cbk([400, 'ExpectedAddressToFindHtlcSecretFromBlockstream']);
        }

        if (!network) {
          return cbk([400, 'ExpectedNetworkToFindHtlcSecretFromBlockstream']);
        }

        if (!request) {
          return cbk([400, 'ExpectedRequestToFindHtlcSecretFromBlockstream']);
        }

        return cbk();
      },

      // Get input witness elements
      getWitnesses: ['validate', async ({}) => {
        return await getTxsFromBlockstream({address, network, request});
      }],

      // Witnesses
      witnesses: ['getWitnesses', async ({getWitnesses}) => {
        const txs = getWitnesses.transactions;

        const ids = txs.map(({id}) => id);
        const inputs = txs.map(({inputs}) => inputs.map(n => n.witness));

        return {ids, inputs: flatten(flatten(inputs))};
      }],

      // Find secret
      preimage: ['witnesses', async ({witnesses}) => {
        const secret = witnesses.inputs.find(witness => {
          if (witness.length !== secretHexLength) {
            return false;
          }

          return sha256(witness).toString('hex') === hash;
        });

        return {secret, ids: witnesses.ids};
      }],
    },
    returnResult({reject, resolve, of: 'preimage'}, cbk));
  });
};

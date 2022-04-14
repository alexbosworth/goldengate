const {createHash} = require('crypto');

const asyncAuto = require('async/auto');
const {returnResult} = require('asyncjs-util');

const {apis} = require('./conf/blockstream-info');

const {isArray} = Array;
const hexAsBuffer = hex => Buffer.from(hex, 'hex');
const sha256 = preimage => createHash('sha256').update(preimage).digest('hex');

/** Get transactions related to an address from Blockstream

  An address or script is required

  {
    [address]: <Address String>
    network: <Network String>
    request: <Request Function>
    [script]: <Output Script Hex String>
  }

  @returns via cbk or Promise
  {
    transactions: [{
      [confirm_height]: <Transaction Confirmed In Block At Height Number>
      id: <Transaction Id Hex String>
      inputs: [{
        transaction_id: <Outpoint Transaction Id Hex String>
        transaction_vout: <Outpoint Transaction Output Index Number>
        witness: [<Witness Hex String>]
      }]
      outputs: [{
        address: <Sending To Address String>
        tokens: <Sending Tokens Number>
      }]
    }]
  }
*/
module.exports = ({address, network, request, script}, cbk) => {
  return new Promise((resolve, reject) => {
    return asyncAuto({
      // Check arguments
      validate: cbk => {
        if (!address && !script) {
          return cbk([400, 'ExpectedAddressOrScriptToFindTransactionsFor']);
        }

        if (!network) {
          return cbk([400, 'ExpectedNetworkToFindTransactionsForAddress']);
        }

        if (!request) {
          return cbk([400, 'ExpectedRequestToGetTxsFromBlockstream']);
        }

        return cbk();
      },

      // Determine which URL to use for the lookup
      url: ['validate', ({}, cbk) => {
        // Exit early when querying for an address
        if (!!address) {
          return cbk(null, `${apis[network]}/address/${address}/txs`);
        }

        const hash = sha256(hexAsBuffer(script));

        return cbk(null, `${apis[network]}/scripthash/${hash}/txs`);
      }],

      // Get transactions
      getTransactions: ['url', ({url}, cbk) => {
        return request({url, json: true}, (err, r, txs) => {
          if (!!err) {
            return cbk([503, 'FailedGettingTxsFromBlockstream', {err}]);
          }

          if (!r) {
            return cbk([503, 'ExpectedResponseGettingTxsFromBlockstream']);
          }

          if (r.statusCode !== 200) {
            return cbk([503, 'UnexpectedStatusGettingTxsFromBlockstream']);
          }

          if (!isArray(txs)) {
            return cbk([503, 'ExpectedTxArrayGettingTxsFromBlockstream']);
          }

          if (!!txs.filter(n => !n).length) {
            return cbk([503, 'ExpectedTransactionFromBlockstreamInArray']);
          }

          if (!!txs.find(({txid}) => !txid)) {
            return cbk([503, 'ExpectedTransactionIdInBlockstreamResponse']);
          }

          if (!!txs.find(({vin}) => !isArray(vin))) {
            return cbk([503, 'ExpectedArrayOfInputsInTxFromBlockstream']);
          }

          if (!!txs.find(n => !n.status)) {
            return cbk([503, 'ExpectedTransactionStatusInBlockstreamTx']);
          }

          const transactions = txs.map(tx => {
            return {
              confirm_height: tx.status.block_height || undefined,
              id: tx.txid,
              inputs: tx.vin.map(input => {
                return {
                  transaction_id: input.txid,
                  transaction_vout: input.vout,
                  witness: input.witness,
                };
              }),
              outputs: tx.vout.map((output, index) => {
                return {
                  index,
                  address: output.scriptpubkey_address,
                  script: output.scriptpubkey,
                  tokens: output.value,
                };
              }),
            };
          });

          return cbk(null, {transactions});
        });
      }],
    },
    returnResult({reject, resolve, of: 'getTransactions'}, cbk));
  });
};

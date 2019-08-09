const asyncAuto = require('async/auto');
const {returnResult} = require('asyncjs-util');

const {apis} = require('./conf/blockstream-info');

const {isArray} = Array;

/** Find a UTXO with an output script matching an address

  {
    address: <UTXO Address String>
    network: <Network Name String>
    request: <Request Function>
  }

  @returns via cbk
  {
    utxos: [{
      [confirm_height]: <Confirmation Block Height Number>
      tokens: <Output Tokens Number>
      transaction_id: <Transaction Id Hex String>
      transaction_vout: <Transaction Output Index Number>
    }]
  }
*/
module.exports = ({address, network, request}, cbk) => {
  return new Promise((resolve, reject) => {
    return asyncAuto({
      // Check arguments
      validate: cbk => {
        if (!address) {
          return cbk([400, 'ExpectedAddressToFindUtxo']);
        }

        if (!network || !apis[network]) {
          return cbk([400, 'ExpectedKnownNetworkToFindUtxo']);
        }

        if (!request) {
          return cbk([400, 'ExpectedRequestFunctionToFindUtxo']);
        }

        return cbk();
      },

      // Get utxos
      getUtxos: ['validate', ({}, cbk) => {
        return request({
          json: true,
          url: `${apis[network]}/address/${address}/utxo`,
        },
        (err, r, utxos) => {
          if (!!err) {
            return cbk([503, 'UnexpectedErrorFromGetUtxosApi', {err}]);
          }

          if (!r) {
            return cbk([503, 'ExpectedResponseFromUtxoApi']);
          }

          const {statusCode} = r;

          if (statusCode !== 200) {
            return cbk([503, 'UnexpectedStatusCodeFromUtxoApi', {statusCode}]);
          }

          if (!isArray(utxos)) {
            return cbk([503, 'ExpectedArrayOfUtxosInBlockstreamApiResponse']);
          }

          if (!!utxos.find(({txid}) => !txid)) {
            return cbk([503, 'ExpectedTransactionIdForUtxoInResponse']);
          }

          if (!!utxos.find(({value}) => value === undefined)) {
            return cbk([503, 'ExpectedTokensValueForUtxoInResponse']);
          }

          if (!!utxos.find(({vout}) => vout === undefined)) {
            return cbk([503, 'ExpectedTxOutputIndexForUtxoInResponse']);
          }

          const unspents = utxos.map(n => ({
            confirm_height: !n.status ? undefined : n.status.block_height,
            tokens: n.value,
            transaction_id: n.txid,
            transaction_vout: n.vout,
          }));

          return cbk(null, {utxos: unspents});
        });
      }],
    },
    returnResult({reject, resolve, of: 'getUtxos'}, cbk));
  });
};

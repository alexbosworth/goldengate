const asyncAuto = require('async/auto');
const request = require('request');

const {apis} = require('./conf/blockstream-info');
const getHeight = require('./get_height');

/** Find a UTXO with an output script matching an address

  {
    address: <UTXO Address String>
    confirmations: <Required Confirmations Count>
    network: <Network Name String>
    tokens: <UTXO Value Tokens Number>
  }

  @returns via cbk
  {
    transaction_id: <Transaction Id Hex String>
    transaction_vout: <Transaction Output Index Number>
  }
*/
module.exports = ({address, confirmations, network, tokens}, cbk) => {
  return asyncAuto({
    // Check arguments
    validate: cbk => {
      if (!address) {
        return cbk([400, 'ExpectedAddressToFindUtxo']);
      }

      if (confirmations === undefined) {
        return cbk([400, 'ExpectedConfirmationsCountToFindUtxo']);
      }

      if (!network || !apis[network]) {
        return cbk([400, 'ExpectedKnownNetworkToFindUtxo']);
      }

      if (!tokens) {
        return cbk([400, 'ExpectedUtxoTokensWhenFindingUtxo']);
      }

      return cbk();
    },

    // Find utxo
    getUtxo: ['validate', ({}, cbk) => {
      return request({
        json: true,
        url: `${apis[network]}/address/${address}/utxo`,
      },
      (err, r, utxos) => {
        if (!!err) {
          return cbk([503, 'UnexpectedResponseFromUtxoApi', err]);
        }

        if (!r || r.statusCode !== 200) {
          return cbk([503, 'UnexpectedStatusCodeFromUtxoApi']);
        }

        if (!Array.isArray(utxos)) {
          return cbk([503, 'ExpectedArrayOfUtxosInApiResponse']);
        }

        if (!utxos.length) {
          return cbk([503, 'ExpectedUtxosForDepositAddress']);
        }

        const [utxo] = utxos;

        if (!utxo.txid) {
          return cbk([503, 'ExpectedUtxoTransactionIdInUtxosApiResponse']);
        }

        if (utxo.value !== tokens) {
          return cbk([503, 'UnexpectedTokensValueForFoundUtxo']);
        }

        if (utxo.vout === undefined) {
          return cbk([503, 'ExpectedUtxoVoutInUtxosApiResponse']);
        }

        return cbk(null, {
          block_height: utxo.status.block_height,
          transaction_id: utxo.txid,
          transaction_vout: utxo.vout,
        });
      });
    }],

    // Get the current height
    getHeight: ['getUtxo', ({}, cbk) => getHeight({network}, cbk)],

    // Check that the current height matches the confirmation expectation
    checkHeight: ['getHeight', 'getUtxo', ({getHeight, getUtxo}, cbk) => {
      if (!confirmations) {
        return cbk();
      }

      const confs = getHeight.height - getUtxo.block_height + [getUtxo].length;

      if (confs < confirmations) {
        return cbk([503, 'ExpectedMoreWorkOnTopOfUtxo']);
      }

      return cbk();
    }],
  },
  (err, res) => {
    if (!!err) {
      return cbk(err);
    }

    return cbk(null, {
      transaction_id: res.getUtxo.transaction_id,
      transaction_vout: res.getUtxo.transaction_vout,
    });
  });
};

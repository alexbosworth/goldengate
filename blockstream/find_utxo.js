const asyncAuto = require('async/auto');

const {apis} = require('./conf/blockstream-info');
const getHeightFromBlockstream = require('./get_height_from_blockstream');

const {isArray} = Array;

/** Find a UTXO with an output script matching an address

  {
    address: <UTXO Address String>
    confirmations: <Required Confirmations Count>
    network: <Network Name String>
    request: <Request Function>
    [tokens]: <UTXO Value Tokens Number>
    [transaction_id]: <Spending Transaction Id Hex String>
    [transaction_vout]: <Spending Transaction Vout Number>
  }

  @returns via cbk
  {
    output_tokens: <Transaction Output Tokens Number>
    transaction_id: <Transaction Id Hex String>
    transaction_vout: <Transaction Output Index Number>
  }
*/
module.exports = (args, cbk) => {
  return asyncAuto({
    // Check arguments
    validate: cbk => {
      if (!args.address) {
        return cbk([400, 'ExpectedAddressToFindUtxo']);
      }

      if (args.confirmations === undefined) {
        return cbk([400, 'ExpectedConfirmationsCountToFindUtxo']);
      }

      if (!args.network || !apis[args.network]) {
        return cbk([400, 'ExpectedKnownNetworkToFindUtxo']);
      }

      if (!args.request) {
        return cbk([400, 'ExpectedRequestFunctionTOFindUtxo']);
      }

      if (!args.tokens && !args.transaction_id) {
        return cbk([400, 'ExpectedUtxoTokensWhenFindingUtxo']);
      }

      if (!!args.transaction_id && args.transaction_vout === undefined) {
        return cbk([400, 'ExpectedTransactionVoutWhenLookingForUtxoSpend']);
      }

      return cbk();
    },

    // Find utxo
    getUtxo: ['validate', ({}, cbk) => {
      return args.request({
        json: true,
        url: `${apis[args.network]}/address/${args.address}/utxo`,
      },
      (err, r, utxos) => {
        if (!!err) {
          return cbk([503, 'UnexpectedResponseFromUtxoApi', {err}]);
        }

        if (!r) {
          return cbk([503, 'ExpectedResponseFromUtxoApi']);
        }

        const code = r.statusCode;

        if (code !== 200) {
          return cbk([503, 'UnexpectedStatusCodeFromUtxoApi', {code}]);
        }

        if (!isArray(utxos)) {
          return cbk([503, 'ExpectedArrayOfUtxosInApiResponse']);
        }

        if (!utxos.length) {
          return cbk([503, 'ExpectedUtxosForDepositAddress']);
        }

        const [utxo] = utxos;

        if (!utxo.txid) {
          return cbk([503, 'ExpectedUtxoTransactionIdInUtxosApiResponse']);
        }

        if (!!args.tokens && utxo.value !== args.tokens) {
          return cbk([503, 'UnexpectedTokensValueForFoundUtxo']);
        }

        if (!!args.transaction_id && utxo.txid !== args.transaction_id) {
          return cbk([503, 'UnexpectedSpendingUtxoTransactionId']);
        }

        if (utxo.vout === undefined) {
          return cbk([503, 'ExpectedUtxoVoutInUtxosApiResponse']);
        }

        if (!!args.transaction_id && utxo.vout !== args.transaction_vout) {
          return cbk([503, 'UnexpectedSpendingUtxoTransactionId']);
        }

        return cbk(null, {
          block_height: utxo.status.block_height,
          output_tokens: utxo.value,
          transaction_id: utxo.txid,
          transaction_vout: utxo.vout,
        });
      });
    }],

    // Get the current height
    getHeight: ['getUtxo', ({}, cbk) => {
      return getHeightFromBlockstream({
        network: args.network,
        request: args.request,
      },
      cbk);
    }],

    // Check that the current height matches the confirmation expectation
    checkHeight: ['getHeight', 'getUtxo', ({getHeight, getUtxo}, cbk) => {
      // Exit early when no confirmations are required
      if (!args.confirmations) {
        return cbk();
      }

      // Exit early when no confirmations have been stacked
      if (!getUtxo.block_height) {
        return cbk([503, 'UtxoNotYetConfirmedIntoABlock']);
      }

      const confs = getHeight.height - getUtxo.block_height + [getUtxo].length;

      if (confs < args.confirmations) {
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
      output_tokens: res.getUtxo.output_tokens,
      transaction_id: res.getUtxo.transaction_id,
      transaction_vout: res.getUtxo.transaction_vout,
    });
  });
};

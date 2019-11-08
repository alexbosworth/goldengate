const asyncAuto = require('async/auto');
const {returnResult} = require('asyncjs-util');

const refundTransaction = require('./refund_transaction');

/** Make refund transaction

  {
    block_height: <Timelock Block Height Number>
    fee_tokens_per_vbyte: <Fee Per Virtual Byte Token Rate Number>
    network: <Network Name String>
    [private_key]: <Refund Private Key WIF String>
    sweep_address: <Sweep Tokens to Address String>
    tokens: <UTXO Tokens Number>
    transaction_id: <UTXO Transaction Id Hex String>
    transaction_vout: <UTXO Transaction Vout Hex String>
    witness_script: <UTXO Witness Script Hex String>
  }

  @returns via cbk or Promise
  {
    transaction: <Sweep Transaction Hex Serialized String>
  }
*/
module.exports = (args, cbk) => {
  return new Promise((resolve, reject) => {
    return asyncAuto({
      // Refund transaction
      refund: cbk => {
        try {
          const {transaction} = refundTransaction({
            block_height: args.block_height,
            fee_tokens_per_vbyte: args.fee_tokens_per_vbyte,
            network: args.network,
            private_key: args.private_key,
            sweep_address: args.sweep_address,
            tokens: args.tokens,
            transaction_id: args.transaction_id,
            transaction_vout: args.transaction_vout,
            witness_script: args.witness_script,
          });

          return cbk(null, {transaction});
        } catch (err) {
          return cbk([500, 'FailedToConstructRefundTransaction', {err}]);
        }
      },
    },
    returnResult({reject, resolve, of: 'refund'}, cbk));
  });
};

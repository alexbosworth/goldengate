const asyncAuto = require('async/auto');
const asyncMapLimit = require('async/mapLimit');
const {getBlock} = require('ln-service');
const {returnResult} = require('asyncjs-util');

const scanBlocksForUtxos = require('./scan_blocks_for_utxos');

const fetchBlocksLimit = 4;

/** Get a batch of blocks and update the unspent utxos with them

  {
    utxos: [{
      [confirmation_height]: <Utxo Confirmation Height Number>
      tokens: <Utxo Tokens Number>
      transaction_id: <Utxo Transaction Id Hex String>
      transaction_vout: <Utxo Transaction Output Index Number>
    }]
    heights: [<Block Height Number>]
    [id]: <Id of the Block Before the Batch Hex String>
    lnd: <Authenticated LND API Object>
    output_script: <Utxo Output Script Hex String>
  }

  @returns via cbk or Promise
  {
    utxos: [{
      [confirmation_height]: <Utxo Confirmation Height Number>
      tokens: <Utxo Tokens Number>
      transaction_id: <Utxo Transaction Id Hex String>
      transaction_vout: <Utxo Transaction Output Index Number>
    }]
    id: <Last Scanned Block Id Hex String>
  }
*/
module.exports = (args, cbk) => {
  return new Promise((resolve, reject) => {
    return asyncAuto({
      // Get the blocks of the batch
      getBlocks: cbk => {
        return asyncMapLimit(args.heights, fetchBlocksLimit, (height, cbk) => {
          return getBlock({height, lnd: args.lnd}, cbk);
        },
        cbk);
      },

      // Scan the blocks of the batch in order
      scan: ['getBlocks', ({getBlocks}, cbk) => {
        const scanned = scanBlocksForUtxos({
          blocks: getBlocks.map(({block}) => block),
          utxos: args.utxos,
          heights: args.heights,
          id: args.id,
          output_script: args.output_script,
        });

        if (!!scanned.error) {
          return cbk(scanned.error);
        }

        return cbk(null, {utxos: scanned.utxos, id: scanned.id});
      }],
    },
    returnResult({reject, resolve, of: 'scan'}, cbk));
  });
};

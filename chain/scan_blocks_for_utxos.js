const {idForBlock} = require('@alexbosworth/blockchain');
const {previousBlockId} = require('@alexbosworth/blockchain');

const scanBlockForUtxos = require('./scan_block_for_utxos');

/** Update the unspent utxos with consecutive blocks, in order

  {
    blocks: [<Raw Block Hex String>]
    utxos: [{
      [confirmation_height]: <Utxo Confirmation Height Number>
      tokens: <Utxo Tokens Number>
      transaction_id: <Utxo Transaction Id Hex String>
      transaction_vout: <Utxo Transaction Output Index Number>
    }]
    heights: [<Block Height Number>]
    [id]: <Id of the Block Before the Blocks Hex String>
    output_script: <Utxo Output Script Hex String>
  }

  @returns
  {
    [utxos]: [{
      [confirmation_height]: <Utxo Confirmation Height Number>
      tokens: <Utxo Tokens Number>
      transaction_id: <Utxo Transaction Id Hex String>
      transaction_vout: <Utxo Transaction Output Index Number>
    }]
    [error]: [<Error Code Number>, <Error Message String>, <Details Object>]
    [id]: <Last Scanned Block Id Hex String>
  }
*/
module.exports = args => {
  // Scan the blocks in order, each block builds on the block before
  return args.blocks.reduce((sum, block, i) => {
    // Exit early when an earlier block could not be scanned
    if (!!sum.error) {
      return sum;
    }

    try {
      const {previous} = previousBlockId({block});

      // A reorg during the scan would mix blocks of different chains
      if (!!sum.id && previous !== sum.id) {
        return {error: [503, 'UnexpectedReorgScanningForSharedUtxos']};
      }

      const scanned = scanBlockForUtxos({
        block,
        utxos: sum.utxos,
        height: args.heights[i],
        output_script: args.output_script,
      });

      return {utxos: scanned.utxos, id: idForBlock({block}).id};
    } catch (err) {
      return {error: [503, 'FailedToScanBlockForSharedUtxos', {err}]};
    }
  },
  {utxos: args.utxos, id: args.id});
};

const asyncAuto = require('async/auto');
const asyncify = require('async/asyncify');
const asyncReduce = require('async/reduce');
const {getBlockHeader} = require('ln-service');
const {idForBlock} = require('@alexbosworth/blockchain');
const {outputScriptForAddress} = require('@alexbosworth/blockchain');
const {returnResult} = require('asyncjs-util');

const batchHeights = require('./batch_heights');
const getHeight = require('./get_height');
const {getUtxosFromBlockstream} = require('./../blockstream');
const isValidUtxo = require('./is_valid_utxo');
const {names} = require('./../conf/networks');
const scanBatchForUtxos = require('./scan_batch_for_utxos');

const blocksPerBatch = 8;
const confirmations = (at, n) => n === undefined ? 0 : Math.max(at, n) - n + 1;
const headerBytesHexCount = 80 * 2;
const {isArray} = Array;
const isConfirmed = n => n.confirmation_height !== undefined;
const isFunded = n => n.tokens !== 0;
const isHash = n => !!n && /^[0-9A-F]{64}$/i.test(n);
const isHeight = n => Number.isInteger(n) && n >= 0;
const {max} = Math;

/** Get the unspent utxos of a shared address

  Either `lnd` or `request` is required, `min_height` is required with `lnd`

  A scan continues from the `id` and `utxos` of the last scan with a
  `min_height` of the block after its `height`

  `id` is required with known `utxos` when scanning blocks with `lnd`

  A reorg of blocks that were scanned before is a 409 error, the scan has to
  start over from the first `min_height` without `id` and `utxos`

  {
    address: <Shared Address String>
    [utxos]: [{
      [confirmation_height]: <Utxo Confirmation Height Number>
      tokens: <Utxo Tokens Number>
      transaction_id: <Utxo Transaction Id Hex String>
      transaction_vout: <Utxo Transaction Output Index Number>
    }]
    [id]: <Utxos Scanned Through Block Id Hex String>
    [lnd]: <Authenticated LND API Object>
    [min_height]: <Scan Blocks Starting At Height Number>
    network: <Network Name String>
    [request]: <Request Function>
  }

  @returns via cbk or Promise
  {
    utxos: [{
      confirmation_count: <Utxo Confirmations Count Number>
      [confirmation_height]: <Utxo Confirmation Height Number>
      tokens: <Utxo Tokens Number>
      transaction_id: <Utxo Transaction Id Hex String>
      transaction_vout: <Utxo Transaction Output Index Number>
    }]
    [height]: <Scanned Through Block Height Number>
    [id]: <Scanned Through Block Id Hex String>
  }
*/
module.exports = (args, cbk) => {
  return new Promise((resolve, reject) => {
    return asyncAuto({
      // Check arguments
      validate: cbk => {
        if (!args.address) {
          return cbk([400, 'ExpectedSharedAddressToGetUtxosFor']);
        }

        if (!!args.utxos && !isArray(args.utxos)) {
          return cbk([400, 'ExpectedArrayOfKnownSharedUtxos']);
        }

        if (!!args.utxos && !args.utxos.every(isValidUtxo)) {
          return cbk([400, 'ExpectedValidKnownSharedUtxos']);
        }

        if (!args.lnd && !args.request) {
          return cbk([400, 'ExpectedLndOrRequestToGetSharedUtxos']);
        }

        if (!!args.lnd && !isHeight(args.min_height)) {
          return cbk([400, 'ExpectedMinHeightToScanForSharedUtxos']);
        }

        // A scan continues from utxos that earlier scans found in blocks
        if (!!args.lnd && !(args.utxos || []).every(isConfirmed)) {
          return cbk([400, 'ExpectedConfirmationHeightsToScanForUtxos']);
        }

        if (!!args.id && !isHash(args.id)) {
          return cbk([400, 'ExpectedValidScannedBlockIdToScanForUtxos']);
        }

        // Known utxos are only valid on the chain that they were scanned on
        if (!!args.lnd && !!(args.utxos || []).length && !args.id) {
          return cbk([400, 'ExpectedScannedBlockIdToScanForKnownUtxos']);
        }

        if (!args.network || !names[args.network]) {
          return cbk([400, 'ExpectedKnownNetworkToGetSharedUtxos']);
        }

        return cbk();
      },

      // Get the output script that utxos pay to
      outputScript: ['validate', asyncify(({}) => {
        try {
          const {script} = outputScriptForAddress({
            address: args.address,
            network: args.network,
          });

          return script;
        } catch (err) {
          throw [400, 'ExpectedValidSharedAddressToGetUtxosFor'];
        }
      })],

      // Get the chain tip height to scan up to
      getTip: ['outputScript', ({}, cbk) => {
        // Exit early when there are no blocks to scan
        if (!args.lnd) {
          return cbk();
        }

        return getHeight({lnd: args.lnd}, cbk);
      }],

      // Get the header of the block that known utxos were scanned through
      getScannedHeader: ['getTip', ({getTip}, cbk) => {
        // Exit early when not continuing from an earlier scan
        if (!getTip || !args.id) {
          return cbk();
        }

        // Exit early when the chain tip has not reached the scanned block yet
        if (getTip.height < args.min_height - 1) {
          return cbk();
        }

        return getBlockHeader({
          height: args.min_height - 1,
          lnd: args.lnd,
        },
        cbk);
      }],

      // Check that the scanned block is still in the best chain
      checkScannedBlock: ['getScannedHeader', ({getScannedHeader}, cbk) => {
        // Exit early when there is no scanned block to check
        if (!getScannedHeader) {
          return cbk();
        }

        const {header} = getScannedHeader;

        if (header.length !== headerBytesHexCount) {
          return cbk([503, 'ExpectedBlockHeaderForScannedBlock']);
        }

        // Known utxos can be wrong when the scanned block was reorganized out
        if (idForBlock({block: header}).id !== args.id.toLowerCase()) {
          return cbk([409, 'UnexpectedReorgOfScannedBlocksForSharedUtxos']);
        }

        return cbk();
      }],

      // Get the unspent outputs of the address from the Blockstream API
      getUtxos: ['outputScript', ({}, cbk) => {
        // Exit early when blocks are scanned instead
        if (!!args.lnd) {
          return cbk();
        }

        // The API includes mempool utxos and leaves out mempool spent utxos
        return getUtxosFromBlockstream({
          address: args.address,
          network: args.network,
          request: args.request,
        },
        cbk);
      }],

      // Get the heights of the blocks to scan, in batches
      batches: ['getTip', ({getTip}, cbk) => {
        // Exit early when there are no blocks to scan
        if (!getTip) {
          return cbk();
        }

        const {batches} = batchHeights({
          end: getTip.height,
          size: blocksPerBatch,
          start: args.min_height,
        });

        return cbk(null, batches);
      }],

      // Scan blocks for utxos and their spends, the mempool is not scanned
      scan: [
        'batches',
        'checkScannedBlock',
        'getTip',
        'outputScript',
        ({batches, getTip, outputScript}, cbk) =>
      {
        // Exit early when there are no blocks to scan
        if (!getTip) {
          return cbk();
        }

        // Utxos confirmed in scanned blocks are found again in the scan
        const known = (args.utxos || []).filter(utxo => {
          return utxo.confirmation_height < args.min_height;
        });

        // The first block to scan has to build on the last scanned block
        const id = !args.id ? undefined : args.id.toLowerCase();

        // Blocks are fetched in batches and then scanned in order
        return asyncReduce(batches, {id, utxos: known}, (scan, batch, cbk) => {
          return scanBatchForUtxos({
            utxos: scan.utxos,
            heights: batch,
            id: scan.id,
            lnd: args.lnd,
            output_script: outputScript,
          },
          cbk);
        },
        cbk);
      }],

      // Check the utxos from the Blockstream API
      apiUtxos: ['getUtxos', ({getUtxos}, cbk) => {
        // Exit early when blocks are scanned instead
        if (!getUtxos) {
          return cbk();
        }

        // Outputs without value add nothing to a swap
        const funded = getUtxos.utxos.filter(isFunded);

        const utxos = funded.map(utxo => ({
          confirmation_height: utxo.confirm_height || undefined,
          tokens: utxo.tokens,
          transaction_id: utxo.transaction_id,
          transaction_vout: utxo.transaction_vout,
        }));

        if (!utxos.every(isValidUtxo)) {
          return cbk([503, 'ExpectedValidUtxosInBlockstreamResponse']);
        }

        return cbk(null, utxos);
      }],

      // Get the chain tip after the API utxos to count their confirmations
      getApiTip: ['apiUtxos', ({apiUtxos}, cbk) => {
        // Exit early when there are no confirmed utxos to count
        if (!apiUtxos || !apiUtxos.some(isConfirmed)) {
          return cbk();
        }

        return getHeight({network: args.network, request: args.request}, cbk);
      }],

      // Height of the chain tip that confirmations are counted to
      height: ['getApiTip', 'getTip', ({getApiTip, getTip}, cbk) => {
        // Exit early when blocks were scanned, counting to the scanned block
        if (!!getTip) {
          // The height does not go back when the chain tip is behind
          return cbk(null, max(getTip.height, args.min_height - 1));
        }

        // Exit early when there are no confirmed API utxos to count
        if (!getApiTip) {
          return cbk();
        }

        return cbk(null, getApiTip.height);
      }],

      // Final utxos with their confirmations
      utxos: [
        'apiUtxos',
        'height',
        'scan',
        ({apiUtxos, height, scan}, cbk) =>
      {
        const found = !scan ? apiUtxos : scan.utxos;

        const utxos = found.map(utxo => ({
          confirmation_count: confirmations(height, utxo.confirmation_height),
          confirmation_height: utxo.confirmation_height,
          tokens: utxo.tokens,
          transaction_id: utxo.transaction_id,
          transaction_vout: utxo.transaction_vout,
        }));

        // Exit early when the utxos are from the Blockstream API
        if (!scan) {
          return cbk(null, {utxos});
        }

        return cbk(null, {height, utxos, id: scan.id});
      }],
    },
    returnResult({reject, resolve, of: 'utxos'}, cbk));
  });
};

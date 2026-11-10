const {compactIntAsNumber} = require('@alexbosworth/blockchain');
const {idForTransaction} = require('@alexbosworth/blockchain');

const blockHeaderByteLength = 80;
const bufferAsHex = buffer => buffer.toString('hex');
const hexAsBuffer = hex => Buffer.from(hex, 'hex');
const isSegWitMarker = (buffer, i) => !buffer[i] && buffer[i + 1] === 1;
const lockTimeByteLength = 4;
const outpoint = n => `${n.transaction_id}:${n.transaction_vout}`;
const outpointByteLength = 36;
const range = count => [...Array(count).keys()];
const segWitMarkerByteLength = 2;
const sequenceByteLength = 4;
const tokensByteLength = 8;
const txIdByteLength = 32;
const valuesOf = map => Array.from(map.values());
const versionByteLength = 4;

/** Update the unspent utxos to an output script with the txs of a block

  {
    block: <Raw Block Hex String>
    utxos: [{
      [confirmation_height]: <Utxo Confirmation Height Number>
      tokens: <Utxo Tokens Number>
      transaction_id: <Utxo Transaction Id Hex String>
      transaction_vout: <Utxo Transaction Output Index Number>
    }]
    height: <Block Height Number>
    output_script: <Utxo Output Script Hex String>
  }

  @throws
  <Error>

  @returns
  {
    utxos: [{
      [confirmation_height]: <Utxo Confirmation Height Number>
      tokens: <Utxo Tokens Number>
      transaction_id: <Utxo Transaction Id Hex String>
      transaction_vout: <Utxo Transaction Output Index Number>
    }]
  }
*/
module.exports = args => {
  const buffer = hexAsBuffer(args.block);
  const known = args.utxos.map(n => [outpoint(n).toLowerCase(), n]);
  const script = hexAsBuffer(args.output_script);

  // Unspent utxos are tracked by their lowercase outpoint
  const unspent = new Map(known);

  let cursor = blockHeaderByteLength;

  // Read a compact size number and move the cursor past it
  const readNumber = () => {
    const {bytes, number} = compactIntAsNumber({
      encoded: buffer,
      start: cursor,
    });

    cursor += bytes;

    return number;
  };

  // A compact int count of transactions follows the block header
  const txCount = readNumber();

  range(txCount).forEach(() => {
    const start = cursor;

    cursor += versionByteLength;

    const isSegWit = isSegWitMarker(buffer, cursor);

    // Move past the SegWit marker and flag
    if (isSegWit) {
      cursor += segWitMarkerByteLength;
    }

    const inputsCount = readNumber();

    // Spending a utxo removes it from the unspent utxos
    range(inputsCount).forEach(() => {
      const txId = buffer.subarray(cursor, cursor + txIdByteLength);
      const vout = buffer.readUInt32LE(cursor + txIdByteLength);

      // Transaction ids are shown in the reverse order of their bytes
      const id = bufferAsHex(Buffer.from(txId).reverse());

      unspent.delete(`${id}:${vout}`);

      cursor += outpointByteLength;

      const scriptLength = readNumber();

      cursor += scriptLength + sequenceByteLength;

      return;
    });

    const outputsCount = readNumber();
    const paying = [];

    // Outputs with value that pay to the output script are utxos
    range(outputsCount).forEach(vout => {
      const tokens = Number(buffer.readBigUInt64LE(cursor));

      cursor += tokensByteLength;

      const scriptLength = readNumber();

      const outputScript = buffer.subarray(cursor, cursor + scriptLength);

      if (!!tokens && outputScript.equals(script)) {
        paying.push({tokens, vout});
      }

      cursor += scriptLength;

      return;
    });

    // Move past the witness stack of each input
    if (isSegWit) {
      range(inputsCount).forEach(() => {
        const elementsCount = readNumber();

        return range(elementsCount).forEach(() => {
          const elementLength = readNumber();

          cursor += elementLength;

          return;
        });
      });
    }

    cursor += lockTimeByteLength;

    // Exit early with error when the transaction is cut short
    if (cursor > buffer.length) {
      throw new Error('UnexpectedEndOfBlockData');
    }

    // Exit early when the transaction does not pay to the output script
    if (!paying.length) {
      return;
    }

    const {id} = idForTransaction({
      transaction: bufferAsHex(buffer.subarray(start, cursor)),
    });

    paying.forEach(({tokens, vout}) => {
      const utxo = {
        tokens,
        confirmation_height: args.height,
        transaction_id: id,
        transaction_vout: vout,
      };

      return unspent.set(outpoint(utxo), utxo);
    });

    return;
  });

  // Exit early with error when the block has data past the transactions
  if (cursor !== buffer.length) {
    throw new Error('UnexpectedDataAfterBlockTransactions');
  }

  return {utxos: valuesOf(unspent)};
};

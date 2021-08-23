const {extractTransaction} = require('psbt');
const {finalizePsbt} = require('psbt');

/** Extract a transaction from a PSBT if it can be extracted

  {
    psbt: <PSBT Hex String>
  }

  @returns
  {
    transaction: <Raw Trarnsaction Hex String>
  }
*/
module.exports = ({psbt}) => {
  // Attempt extracting a transaction from a finalized PSBT
  try {
    const {transaction} = extractTransaction({psbt});

    return {transaction};
  } catch (err) {
    // Ignore errors when transaction extraction fails
  }

  // Attempt extraction a transaction from a non-final PSBT
  try {
    const finalized = finalizePsbt({psbt});

    const {transaction} = extractTransaction({psbt: finalized.psbt});

    return {transaction};
  } catch (err) {
    // Ignore errors when the transaction cannot be extracted
  }

  // Return nothing when there are no remaining options to extract a tx
  return {};
};

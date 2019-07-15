const {Transaction} = require('bitcoinjs-lib');

const {fromHex} = Transaction;
const notFoundIndex = -1;

/** Find an output and input in a transaction matching a pattern of a spend

  {
    [id]: <Spends Transaction Id Hex String>
    script: <Output Script Hex String>
    [tokens]: <Output Value Tokens Number>
    transaction: <Transaction Hex String>
    [vout]: <Spends Vout Number>
  }

  @throws
  <Error>

  @returns
  {
    output: {
      id: <Transaction Id Hex String>
      tokens: <Output Tokens Number>
      vout: <Transaction Output Index Number>
    }
  }
*/
module.exports = ({id, script, tokens, transaction, vout}) => {
  if (!!id && vout === undefined) {
    throw new Error('ExpectedVoutWhenSpendingOutpointIdIsSpecified');
  }

  if (!script) {
    throw new Error('ExpectedSpendingScriptToFindOutput')
  }

  try {
    fromHex(transaction)
  } catch (err) {
    throw new Error('ExpectedValidTransactionToFindOutput');
  }

  const tx = fromHex(transaction);

  const vin = tx.ins.findIndex(input => {
    // Any vin is acceptable when there is no spending outpoint specified
    if (!id) {
      return true;
    }

    // The input outpoint must match the transaction id
    if (!input.hash.equals(Buffer.from(id, 'hex').reverse())) {
      return false;
    }

    // The input output index must match the transaction vout
    if (input.index !== vout) {
      return false;
    }

    return true;
  });

  if (vin === notFoundIndex) {
    return {};
  }

  const outputIndex = tx.outs.findIndex(output => {
    // Ignore output if the value isn't as expected
    if (!!tokens && output.value < tokens) {
      return false;
    }

    // Ignore output if the script isn't as expected
    if (!output.script.equals(Buffer.from(script, 'hex'))) {
      return false;
    }

    return true;
  });

  if (outputIndex === notFoundIndex) {
    return {};
  }

  return {
    output: {
      id: tx.getId(),
      tokens: tx.outs[outputIndex].value,
      vout: outputIndex,
    },
  };
};

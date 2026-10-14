const {componentsOfTransaction} = require('@alexbosworth/blockchain');
const {idForTransaction} = require('@alexbosworth/blockchain');

const hexAsBuffer = hex => Buffer.from(hex, 'hex');
const isEqualHex = (a, b) => hexAsBuffer(a).equals(hexAsBuffer(b));
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
    componentsOfTransaction({transaction});
  } catch (err) {
    throw new Error('ExpectedValidTransactionToFindOutput');
  }

  const tx = componentsOfTransaction({transaction});

  const vin = tx.inputs.findIndex(input => {
    // Any vin is acceptable when there is no spending outpoint specified
    if (!id) {
      return true;
    }

    // The input outpoint must match the transaction id
    if (!isEqualHex(input.id, id)) {
      return false;
    }

    // The input output index must match the transaction vout
    if (input.vout !== vout) {
      return false;
    }

    return true;
  });

  if (vin === notFoundIndex) {
    return {};
  }

  const outputIndex = tx.outputs.findIndex(output => {
    // Ignore output if the value isn't as expected
    if (!!tokens && output.tokens < tokens) {
      return false;
    }

    // Ignore output if the script isn't as expected
    if (!isEqualHex(output.script, script)) {
      return false;
    }

    return true;
  });

  if (outputIndex === notFoundIndex) {
    return {};
  }

  return {
    output: {
      id: idForTransaction({transaction}).id,
      tokens: tx.outputs[outputIndex].tokens,
      vout: outputIndex,
    },
  };
};

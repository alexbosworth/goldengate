const {componentsOfTransaction} = require('@alexbosworth/blockchain');

const {versionOfSwapScript} = require('./../script');

const byteLength = hex => hex.length / 2;
const minWitnessStackLength = 3;
const preimageByteLength = 32;
const publicKeyByteLength = 33;
const swapV1 = 1;
const swapV2 = 2;
const sweepInputLength = 1;

/** Determine if a transaction is an HTLC sweep

  {
    transaction: <Raw Transaction Hex String>
  }

  @throws
  <Error>

  @returns
  {
    [is_success_sweep]: <Transaction is HTLC Success Sweep Bool>
    [is_timeout_sweep]: <Transaction is HTLC Timeout Sweep Bool>
  }
*/
module.exports = ({transaction}) => {
  if (!transaction) {
    throw new Error('ExpectedTransactionToDetermineIfTxIsSweep');
  }

  const {inputs} = componentsOfTransaction({transaction});

  // Exit early when the number of inputs is not the expected number
  if (inputs.length !== sweepInputLength) {
    return {};
  }

  const [input] = inputs;

  // An input without a witness has an empty witness stack
  const witness = input.witness || [];

  const [script] = witness.slice().reverse();

  if (!script) {
    return {};
  }

  const {version} = versionOfSwapScript({script});

  // Exit early when the number of witness stack elements is not expected
  if (witness.length < minWitnessStackLength) {
    return {};
  }

  // Byte lengths of the first two witness stack elements
  const [firstLength, secondLength] = witness.map(byteLength);

  switch (version) {
  case swapV1:
    // A v1 sweep has a signature and then the unlock element
    return {
      is_success_sweep: secondLength === preimageByteLength,
      is_timeout_sweep: secondLength !== preimageByteLength,
    };

  case swapV2:
    return {
      is_success_sweep: firstLength === preimageByteLength,
      is_timeout_sweep: secondLength === publicKeyByteLength,
    };

  default:
    return {};
  }
};

const {Transaction} = require('bitcoinjs-lib');

const {versionOfSwapScript} = require('./../script');

const bufferAsHex = buffer => buffer.toString('hex');
const {fromHex} = Transaction;
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

  const {ins} = fromHex(transaction);

  // Exit early when the number of inputs is not the expected number
  if (!ins || ins.length !== sweepInputLength) {
    return {};
  }

  const [{witness}] = ins;

  const [script] = witness.slice().reverse();

  if (!script) {
    return {};
  }

  const {version} = versionOfSwapScript({script: bufferAsHex(script)});

  // Exit early when the number of witness stack elements is not expected
  if (!witness || witness.length < minWitnessStackLength) {
    return {};
  }

  switch (version) {
  case swapV1:
    const [signature, unlock] = witness;

    return {
      is_success_sweep: unlock.length === preimageByteLength,
      is_timeout_sweep: unlock.length !== preimageByteLength,
    };

  case swapV2:
    const [stackItem1, stackItem2] = witness;

    return {
      is_success_sweep: stackItem1.length === preimageByteLength,
      is_timeout_sweep: stackItem2.length === publicKeyByteLength,
    };

  default:
    return {};
  }
};

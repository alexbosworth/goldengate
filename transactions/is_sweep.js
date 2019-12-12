const {OP_CHECKLOCKTIMEVERIFY} = require('bitcoin-ops');
const {OP_CHECKSIG} = require('bitcoin-ops');
const {OP_DROP} = require('bitcoin-ops');
const {OP_ELSE} = require('bitcoin-ops');
const {OP_ENDIF} = require('bitcoin-ops');
const {OP_EQUAL} = require('bitcoin-ops');
const {OP_EQUALVERIFY} = require('bitcoin-ops');
const {OP_HASH160} = require('bitcoin-ops');
const {OP_IF} = require('bitcoin-ops');
const {OP_SIZE} = require('bitcoin-ops');
const {script} = require('bitcoinjs-lib');
const {Transaction} = require('bitcoinjs-lib');

const {decompile} = script;
const {fromHex} = Transaction;
const nullByte = Buffer.alloc(1);
const preimageByteLength = 32;
const sweepInputLength = 1;
const timeoutWitnessStackLength = 3;

const template = [
  OP_SIZE, (preimageByteLength).toString(16), OP_EQUAL,
  OP_IF,
    OP_HASH160, Buffer.alloc(20), OP_EQUALVERIFY,
    Buffer.alloc(33),
  OP_ELSE,
    OP_DROP, Buffer.alloc(1), OP_CHECKLOCKTIMEVERIFY, OP_DROP,
    Buffer.alloc(33),
  OP_ENDIF,
  OP_CHECKSIG,
];

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
  if (ins.length !== sweepInputLength) {
    return {};
  }

  const [{witness}] = ins;

  // Exit early when the number of witness stack elements is not expected
  if (witness.length !== timeoutWitnessStackLength) {
    return {};
  }

  const [signature, unlock, program] = witness;

  const unexpectedElement = decompile(program).find((element, i) => {
    const expected = template[i];

    // When a buffer is expected, the element should be a buffer
    if (Buffer.isBuffer(expected) && !Buffer.isBuffer(element)) {
      return true;
    }

    // When the expected element is a string, check hex serialized
    if (typeof expected === 'string') {
      return element.toString('hex') !== expected;
    }

    // Buffers must be greater than or equal to the expected length
    if (Buffer.isBuffer(expected)) {
      return element.length < expected.length;
    }

    // The op code should match the expected op code
    return element !== expected;
  });

  if (!!unexpectedElement) {
    return {};
  }

  return {
    is_success_sweep: unlock.length === preimageByteLength,
    is_timeout_sweep: unlock.length !== preimageByteLength,
  };
};

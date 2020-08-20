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

const isScriptMatchingTemplate = require('./is_script_matching_template');

const template = [
  OP_SIZE, (32).toString(16), OP_EQUAL,
  OP_IF,
    OP_HASH160, Buffer.alloc(20), OP_EQUALVERIFY,
    Buffer.alloc(33),
  OP_ELSE,
    OP_DROP, Buffer.alloc(1), OP_CHECKLOCKTIMEVERIFY, OP_DROP,
    Buffer.alloc(33),
  OP_ENDIF,
  OP_CHECKSIG,
];

/** Determine if a witness script is a v1 swap script

  {
    script: <Witness Script Hex String>
  }

  @throws
  <Error>

  @returns
  <Is V1 Swap Script Bool>
*/
module.exports = ({script}) => {
  if (!script) {
    throw new Error('ExpectedWitnessScriptToDetermineIfScriptIsV1SwapScript');
  }

  return isScriptMatchingTemplate({script, template});
};

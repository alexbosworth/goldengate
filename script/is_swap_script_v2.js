const {OP_1} = require('bitcoin-ops');
const {OP_CHECKLOCKTIMEVERIFY} = require('bitcoin-ops');
const {OP_CHECKSEQUENCEVERIFY} = require('bitcoin-ops');
const {OP_CHECKSIG} = require('bitcoin-ops');
const {OP_CHECKSIGVERIFY} = require('bitcoin-ops');
const {OP_DUP} = require('bitcoin-ops');
const {OP_ELSE} = require('bitcoin-ops');
const {OP_ENDIF} = require('bitcoin-ops');
const {OP_EQUALVERIFY} = require('bitcoin-ops');
const {OP_HASH160} = require('bitcoin-ops');
const {OP_NOTIF} = require('bitcoin-ops');
const {OP_SIZE} = require('bitcoin-ops');

const isScriptMatchingTemplate = require('./is_script_matching_template');

const template = [
  Buffer.alloc(33), OP_CHECKSIG,
  OP_NOTIF,
    OP_DUP, OP_HASH160, Buffer.alloc(20),
    OP_EQUALVERIFY,
    OP_CHECKSIGVERIFY,
    Buffer.alloc(1), OP_CHECKLOCKTIMEVERIFY,
  OP_ELSE,
    OP_SIZE, (32).toString(16),
    OP_EQUALVERIFY,
    OP_HASH160, Buffer.alloc(20), OP_EQUALVERIFY,
    OP_1,
    OP_CHECKSEQUENCEVERIFY,
  OP_ENDIF,
];

/** Determine if a witness script is a v2 swap script

  {
    script: <Witness Script Hex String>
  }

  @throws
  <Error>

  @returns
  <Is V2 Swap Script Bool>
*/
module.exports = ({script}) => {
  if (!script) {
    throw new Error('ExpectedWitnessScriptToDetermineIfScriptIsV2SwapScript');
  }

  return isScriptMatchingTemplate({script, template});
};

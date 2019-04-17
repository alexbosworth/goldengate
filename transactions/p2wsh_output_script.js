const {crypto} = require('bitcoinjs-lib');
const {OP_0} = require('bitcoin-ops');
const {script} = require('bitcoinjs-lib');

const {compile} = script;
const hexAsBuffer = hex => Buffer.from(hex, 'hex');
const {sha256} = crypto;

/** Encode p2wsh output script

  {
    script: <Redeem Script Hex String>
  }

  @returns
  {
    output: <P2WSH Output Script String>
  }
*/
module.exports = ({script}) => {
  return {
    output: compile([OP_0, sha256(hexAsBuffer(script))]).toString('hex'),
  };
};

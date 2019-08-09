const {crypto} = require('bitcoinjs-lib');
const {OP_0} = require('bitcoin-ops');
const {script} = require('bitcoinjs-lib');

const compileScript = elements => script.compile(elements).toString('hex');
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
  return {output: compileScript([OP_0, sha256(hexAsBuffer(script))])};
};

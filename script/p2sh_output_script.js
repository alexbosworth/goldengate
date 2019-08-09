const {crypto} = require('bitcoinjs-lib');
const {OP_EQUAL} = require('bitcoin-ops');
const {OP_HASH160} = require('bitcoin-ops');
const {script} = require('bitcoinjs-lib');

const compileScript = elements => script.compile(elements).toString('hex');
const hash160 = hexPreimage => crypto.hash160(Buffer.from(hexPreimage, 'hex'));

/** Get a P2SH output script for a redeem script

  {
    script: <Redeem Script Hex String>
  }

  @returns
  {
    output: <Output Script Hex String>
  }
*/
module.exports = ({script}) => {
  return {output: compileScript([OP_HASH160, hash160(script), OP_EQUAL])};
};

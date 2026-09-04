const {createHash} = require('crypto');

const {p2wshOutputScript} = require('@alexbosworth/blockchain');

const bufferAsHex = buffer => buffer.toString('hex');
const hexAsBuffer = hex => Buffer.from(hex, 'hex');
const sha256 = preimage => createHash('sha256').update(preimage).digest();

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
  const hash = sha256(hexAsBuffer(script));

  return {output: bufferAsHex(p2wshOutputScript({hash}).script)};
};

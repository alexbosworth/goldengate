const {createHash} = require('crypto');

const {p2shOutputScript} = require('@alexbosworth/blockchain');

const bufferAsHex = buffer => buffer.toString('hex');
const hexAsBuffer = hex => Buffer.from(hex, 'hex');
const ripemd160 = buffer => createHash('ripemd160').update(buffer).digest();
const sha256 = preimage => createHash('sha256').update(preimage).digest();

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
  const hash = ripemd160(sha256(hexAsBuffer(script)));

  return {output: bufferAsHex(p2shOutputScript({hash}).script)};
};

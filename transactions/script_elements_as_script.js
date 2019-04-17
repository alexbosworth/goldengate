const BN = require('bn.js');

const {encode} = require('varuint-bitcoin');

const decBase = 10;

/** Array of script buffer elements to a fully formed script

  {
    elements: [<Data Buffer>, <Script OP_CODE Decimal Number>]
  }

  @throws
  <Error> when a script element length exceeds maximum

  @returns
  {
    script: <Script Hex>
  }
*/
module.exports = ({elements}) => {
   // Convert numbers to buffers and hex data to pushdata
  const fullScript = elements
    .map(element => {
      if (Buffer.isBuffer(element)) {
        return Buffer.concat([encode(element.length), element]);
      }

      return new BN(element, decBase).toArrayLike(Buffer);
    })
    .reduce((element, script) => Buffer.concat([element, script]));

  return {script: fullScript.toString('hex')};
};

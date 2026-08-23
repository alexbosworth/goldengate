const {encode} = require('varuint-bitcoin');

const hexBase = 16;
const isEvenLength = hex => !(hex.length % 2);
const paddedHex = hex => `0${hex}`;

/** Array of script buffer elements to a fully formed script

  {
    elements: [<Data Buffer>, <Script OP_CODE Decimal Number>]
  }

  @throws
  <Error>

  @returns
  {
    script: <Script Hex String>
  }
*/
module.exports = ({elements}) => {
   // Convert numbers to buffers and hex data to pushdata
  const fullScript = elements
    .map(element => {
      if (Buffer.isBuffer(element)) {
        return Buffer.concat([encode(element.length).buffer, element]);
      } else {
        const hex = element.toString(hexBase);

        return Buffer.from(isEvenLength(hex) ? hex : paddedHex(hex), 'hex');
      }
    })
    .reduce((element, script) => Buffer.concat([element, script]));

  return {script: fullScript.toString('hex')};
};

const {OP_0} = require('bitcoin-ops');
const {OP_1} = require('bitcoin-ops');
const {OP_1NEGATE} = require('bitcoin-ops');

const {isBuffer} = Buffer;
const maxSmallNumber = 16;
const minSmallNumber = 1;
const negativeOne = 0x81;
const singleByte = 1;

/** Get the minimal form of a script element

  Data pushes that have an op code equivalent are considered as that op code

  {
    element: <Data Push Buffer Object or Op Code Number>
  }

  @returns
  {
    element: <Data Push Buffer Object or Op Code Number>
  }
*/
module.exports = ({element}) => {
  // Exit early when the element is not a data push
  if (!isBuffer(element)) {
    return {element};
  }

  // An empty push is equivalent to OP_0
  if (!element.length) {
    return {element: OP_0};
  }

  // Exit early when the push is more than a single byte
  if (element.length !== singleByte) {
    return {element};
  }

  const [byte] = element;

  // A single byte of 1 to 16 is equivalent to OP_1 to OP_16
  if (byte >= minSmallNumber && byte <= maxSmallNumber) {
    return {element: OP_1 + byte - minSmallNumber};
  }

  // A single byte of -1 is equivalent to OP_1NEGATE
  if (byte === negativeOne) {
    return {element: OP_1NEGATE};
  }

  return {element};
};

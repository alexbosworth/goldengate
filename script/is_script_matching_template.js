const {script} = require('bitcoinjs-lib');

const bufferAsHex = buffer => buffer.toString('hex');
const {decompile} = script;
const hexAsBuffer = hex => Buffer.from(hex, 'hex');
const {isArray} = Array;
const {isBuffer} = Buffer;
const isString = n => typeof n === 'string';

/** Determine if a witness script matches a template

  {
    script: <Witness Script Hex String>
    template: [<Script Template Element Object>]
  }

  @throws
  <Error>

  @returns
  <Script Matches Passed Template Bool>
*/
module.exports = ({script, template}) => {
  if (!script) {
    throw new Error('ExpectedScriptToCheckIfScriptMatchesTemplate');
  }

  if (!isArray(template)) {
    throw new Error('ExpectedScriptTemplateToCheckIfScriptMatchesTemplate');
  }

  const decompiled = decompile(hexAsBuffer(script));

  // Exit early when the script element count does not match the template
  if (decompiled.length !== template.length) {
    return false;
  }

  const unexpectedElement = decompiled.find((element, i) => {
    const expected = template[i];

    // When a buffer is expected, the element should be a buffer
    if (isBuffer(expected) && !isBuffer(element)) {
      return true;
    }

    // Buffers must be greater than or equal to the expected length
    if (isBuffer(expected)) {
      return element.length < expected.length;
    }

    // When the expected element is a string, check hex serialized
    if (isString(expected)) {
      return bufferAsHex(element) !== expected;
    }

    // The op code should match the expected op code
    return element !== expected;
  });

  // The presence of no unexpected element indicates a template match
  return !unexpectedElement;
};

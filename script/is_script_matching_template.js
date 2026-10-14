const {scriptAsScriptElements} = require('@alexbosworth/blockchain');

const minimalScriptElement = require('./minimal_script_element');

const asMinimal = element => minimalScriptElement({element}).element;
const bufferAsHex = buffer => buffer.toString('hex');
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

  // Parse the hex like Buffer.from does, so invalid hex is a mismatch
  const {elements} = scriptAsScriptElements({
    script: bufferAsHex(hexAsBuffer(script)),
  });

  // Exit early when the script cannot be decoded into elements
  if (!elements) {
    return false;
  }

  const decompiled = elements.map(asMinimal);

  // Exit early when the script element count does not match the template
  if (decompiled.length !== template.length) {
    return false;
  }

  const hasUnexpectedElement = decompiled.some((element, i) => {
    const expected = template[i];

    // When a buffer is expected, the element should be a buffer
    if (isBuffer(expected) && !isBuffer(element)) {
      return true;
    }

    // Buffers must be greater than or equal to the expected length
    if (isBuffer(expected)) {
      return element.length < expected.length;
    }

    // When the expected element is a string, check hex serialized data
    if (isString(expected)) {
      return !isBuffer(element) || bufferAsHex(element) !== expected;
    }

    // The op code should match the expected op code
    return element !== expected;
  });

  // The presence of no unexpected element indicates a template match
  return !hasUnexpectedElement;
};

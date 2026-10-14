const {equal} = require('node:assert').strict;
const test = require('node:test');
const {throws} = require('node:assert').strict;

const method = require('./../../script/encode_script_number');

const tests = [
  {
    args: {number: 0},
    description: 'Zero is encoded as an empty script number',
    expected: '',
  },
  {
    args: {number: 1},
    description: 'One is encoded as a single byte',
    expected: '01',
  },
  {
    args: {number: -1},
    description: 'Negative one has the sign bit set',
    expected: '81',
  },
  {
    args: {number: 16},
    description: 'Small numbers are a single byte',
    expected: '10',
  },
  {
    args: {number: 127},
    description: 'The largest single byte number is encoded',
    expected: '7f',
  },
  {
    args: {number: 128},
    description: 'A sign byte is added when the high bit is set',
    expected: '8000',
  },
  {
    args: {number: -128},
    description: 'A negative sign byte is added when the high bit is set',
    expected: '8080',
  },
  {
    args: {number: 255},
    description: 'A full byte value needs a sign byte',
    expected: 'ff00',
  },
  {
    args: {number: -255},
    description: 'A negative full byte value needs a negative sign byte',
    expected: 'ff80',
  },
  {
    args: {number: 256},
    description: 'Numbers are encoded little endian',
    expected: '0001',
  },
  {
    args: {number: 32767},
    description: 'The largest two byte number is encoded',
    expected: 'ff7f',
  },
  {
    args: {number: 32768},
    description: 'A two byte number with the high bit set needs a sign byte',
    expected: '008000',
  },
  {
    args: {number: -32768},
    description: 'A negative number with a full top byte gets a sign byte',
    expected: '008080',
  },
  {
    args: {number: 1571879},
    description: 'A block height timeout is encoded',
    expected: '27fc17',
  },
  {
    args: {number: 499999999},
    description: 'The largest block height timeout is encoded',
    expected: 'ff64cd1d',
  },
  {
    args: {number: 2147483647},
    description: 'The largest four byte number is encoded',
    expected: 'ffffff7f',
  },
  {
    args: {number: -2147483647},
    description: 'The smallest four byte number is encoded',
    expected: 'ffffffff',
  },
  {
    args: {number: 2147483648},
    description: 'A four byte number with the high bit set needs a sign byte',
    expected: '0000008000',
  },
  {
    args: {number: 4294967295},
    description: 'The largest unsigned four byte number is encoded',
    expected: 'ffffffff00',
  },
  {
    args: {number: 549755813887},
    description: 'A number beyond 32 bits is encoded',
    expected: 'ffffffff7f',
  },
  {
    args: {},
    description: 'A number is expected',
    error: 'ExpectedIntegerToEncodeAsScriptNumber',
  },
  {
    args: {number: 1.5},
    description: 'A whole number is expected',
    error: 'ExpectedIntegerToEncodeAsScriptNumber',
  },
  {
    args: {number: '1'},
    description: 'A number type is expected',
    error: 'ExpectedIntegerToEncodeAsScriptNumber',
  },
  {
    args: {number: NaN},
    description: 'A real number is expected',
    error: 'ExpectedIntegerToEncodeAsScriptNumber',
  },
  {
    args: {number: Number.MAX_SAFE_INTEGER + 1},
    description: 'A safe integer is expected',
    error: 'ExpectedIntegerToEncodeAsScriptNumber',
  },
];

tests.forEach(({args, description, error, expected}) => {
  return test(description, (t, end) => {
    if (!!error) {
      throws(() => method(args), new Error(error), 'Got expected error');
    } else {
      const {encoded} = method(args);

      equal(encoded.toString('hex'), expected, 'Got expected script number');
    }

    return end();
  });
});

const {deepEqual} = require('node:assert').strict;
const test = require('node:test');

const lightninglabs = './../../lightninglabs/';

const parsePaymentMetadata = require(`${lightninglabs}parse_payment_metadata`);

const defaultMacaroon = `AgEEbHNhdAJCAADXNkGQ+faRDM3Ey4M6YGALyTwqnLqDTNVgCBckgnpSZ4vd9z8+Ndr1+zLD6i/AmJIbDVuEAvBwgZBezq2hcys5AAIPc2VydmljZXM9bG9vcDowAAISbG9vcF9jYXBhYmlsaXRpZXM9AAAGIDPTqKe/hckryPR6hINTa7Dg8/bbxqVqq02/eBMpmt7Z`;

const makeAuth = ({macaroon, request, scheme}) => {
  const useMacaroon = macaroon || `macaroon="${defaultMacaroon}"`;
  const useRequest = request || `invoice="invoice"`;
  const useScheme = scheme || 'LSAT';

  return `${useScheme} ${useMacaroon},${useRequest}`;
};

const tests = [
  {
    args: {},
    description: 'No metadata returns nothing',
    expected: {},
  },
  {
    args: {metadata: {}},
    description: 'No metadata array representation returns nothing',
    expected: {},
  },
  {
    args: {metadata: []},
    description: 'An auth header array with an element is required',
    expected: {},
  },
  {
    args: {metadata: ['']},
    description: 'A valid auth header is required',
    expected: {},
  },
  {
    args: {metadata: [makeAuth({scheme: 'scheme'})]},
    description: 'The LSAT scheme is expected',
    expected: {},
  },
  {
    args: {metadata: [makeAuth({macaroon: 'm="m"'})]},
    description: 'A macaroon is required',
    expected: {},
  },
  {
    args: {metadata: [makeAuth({request: 'r="r"'})]},
    description: 'A payment request is expected',
    expected: {},
  },
  {
    args: {metadata: [makeAuth({macaroon: 'macaroon="macaroon"'})]},
    description: 'Payment is returned',
    expected: {},
  },
  {
    args: {metadata: [makeAuth({})]},
    description: 'Payment is returned',
    expected: {
      payment: {
        id: '8bddf73f3e35daf5fb32c3ea2fc098921b0d5b8402f07081905eceada1732b39',
        macaroon: defaultMacaroon,
        request: 'invoice',
      },
    },
  },
];

tests.forEach(({args, description, expected}) => {
  return test(description, (t, end) => {
    const {payment} = parsePaymentMetadata(args);

    deepEqual(payment, expected.payment, 'Got expected payment details');

    return end();
  });
});

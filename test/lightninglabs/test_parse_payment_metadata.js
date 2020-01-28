const {test} = require('tap');

const lightninglabs = './../../lightninglabs/';

const parsePaymentMetadata = require(`${lightninglabs}parse_payment_metadata`);

const makeAuth = ({macaroon, request, scheme}) => {
  const useMacaroon = macaroon || `macaroon="macaroon"`;
  const useRequest = request || `invoice="invoice"`;
  const useScheme = scheme || 'LSAT';

  return `${useScheme} ${useMacaroon}, ${useRequest}`;
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
    description: 'A macaroon is requested',
    expected: {},
  },
  {
    args: {metadata: [makeAuth({request: 'r="r"'})]},
    description: 'A payment request is expected',
    expected: {},
  },
  {
    args: {metadata: [makeAuth({})]},
    description: 'Payment is returned',
    expected: {payment: {macaroon: 'macaroon', request: 'invoice'}},
  },
];

tests.forEach(({args, description, expected}) => {
  return test(description, ({deepIs, end}) => {
    const {payment} = parsePaymentMetadata(args);

    deepIs(payment, expected.payment, 'Got expected payment details');

    return end();
  });
});

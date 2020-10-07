const {test} = require('tap');

const {getSwapMacaroon} = require('./../../');
const {loopOutTermsResponse} = require('./fixtures');

const macaroon = 'AgEEbHNhdAJCAADXNkGQ+faRDM3Ey4M6YGALyTwqnLqDTNVgCBckgnpSZ4vd9z8+Ndr1+zLD6i/AmJIbDVuEAvBwgZBezq2hcys5AAIPc2VydmljZXM9bG9vcDowAAISbG9vcF9jYXBhYmlsaXRpZXM9AAAGIDPTqKe/hckryPR6hINTa7Dg8/bbxqVqq02/eBMpmt7Z';

const auth = `LSAT macaroon="${macaroon}", invoice="invoice"`;

const loopOutTerms = ({}, {}, cbk) => cbk(null, loopOutTermsResponse);

const tests = [
  {
    args: {},
    description: 'A swap service is required to get a swap macaroon',
    error: [400, 'ExpectedServiceToGetSwapMacaroonPaymentDetails'],
  },
  {
    args: {service: {loopOutTerms, newLoopOutSwap: ({}, {}, cbk) => cbk()}},
    description: 'An error is expected',
    error: [503, 'ExpectedPaymentErrWhenPurchasingSwapMacaroon'],
  },
  {
    args: {
      service: {
        loopOutTerms,
        newLoopOutSwap: ({}, {}, cbk) => cbk({details: 'details'}),
      },
    },
    description: 'A payment error is expected',
    error: [503, 'UnexpectedErrorPurchasingSwapMacaroon'],
  },
  {
    args: {
      service: {
        loopOutTerms,
        newLoopOutSwap: ({}, {}, cbk) => cbk({
          details: 'payment required',
          metadata: {get: () => []},
        }),
      },
    },
    description: 'Payment full error details are expected',
    error: [503, 'FailedToGetPaymentDetailsForSwapMacaroon'],
  },
  {
    args: {
      service: {
        loopOutTerms,
        newLoopOutSwap: ({}, {}, cbk) => cbk({
          details: 'payment required',
          metadata: {get: () => [auth]},
        }),
      },
    },
    description: 'Payment details are expected',
    expected: {macaroon, request: 'invoice'},
  },
];

tests.forEach(({args, description, error, expected}) => {
  return test(description, async ({equal, end, rejects}) => {
    if (!!error) {
      rejects(getSwapMacaroon(args), error, 'Got expected error');
    } else {
      const {macaroon, request} = await getSwapMacaroon(args);

      equal(macaroon, expected.macaroon, 'Got expected unpaid macaroon');
      equal(request, expected.request, 'Got expected payment request');
    }

    return end();
  });
});

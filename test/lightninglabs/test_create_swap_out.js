const {ECPair} = require('bitcoinjs-lib');
const {test} = require('@alexbosworth/tap');

const {createSwapOut} = require('./../../');

const expiry = 150;
const serviceKey = ECPair.makeRandom().publicKey.toString('hex');

const makeService = ({overrides}) => {
  const res = {
    expiry,
    prepay_invoice: 'prepay_invoice',
    sender_key: serviceKey,
    swap_invoice: 'swap_invoice',
  };

  Object.keys(overrides || {}).forEach(k => res[k] = overrides[k]);

  return {newLoopOutSwap: ({}, {}, cbk) => cbk(null, res)};
};

const makeArgs = overrides => {
  const args = {
    network: 'btctestnet',
    service: makeService({}),
    tokens: 100,
  };

  Object.keys(overrides).forEach(k => args[k] = overrides[k]);

  return args;
};

const tests = [
  {
    args: makeArgs({network: undefined}),
    description: 'A network name is expected',
    error: [400, 'ExpectedNetworkWhenCreatingSwap'],
  },
  {
    args: makeArgs({service: undefined}),
    description: 'A service object is expected',
    error: [400, 'ExpectedServiceToCreateSwap'],
  },
  {
    args: makeArgs({tokens: undefined}),
    description: 'A token count is expected',
    error: [400, 'ExpectedTokensToCreateSwap'],
  },
  {
    args: makeArgs({
      service: makeService({overrides: {prepay_invoice: undefined}}),
    }),
    description: 'A prepay invoice is expected',
    error: [503, 'ExpectedPrepayInvoiceInSwapCreationResponse'],
  },
  {
    args: makeArgs({
      service: makeService({overrides: {swap_invoice: undefined}}),
    }),
    description: 'A swap invoice is expected',
    error: [503, 'ExpectedSwapInvoiceInSwapCreationResponse'],
  },
  {
    args: makeArgs({}),
    description: 'Create a swap',
    expected: {
      expiry,
      prepay: 'prepay_invoice',
      swap_payreq: 'swap_invoice',
    },
  },
];

tests.forEach(({args, description, error, expected}) => {
  return test(description, async ({equal, end, rejects}) => {
    if (!!error) {
      await rejects(createSwapOut(args), error, 'Got expected error');
    } else {
      const res = await createSwapOut(args);

      equal(!!res.private_key, true, 'Private key created');
      equal(!!res.secret, true, 'Preimage secret created');
      equal(res.service_public_key, serviceKey, 'Service key returned');
      equal(res.swap_execute_request, expected.prepay, 'Prepay pay request');
      equal(res.swap_fund_request, expected.swap_payreq, 'Swap pay request');
      equal(res.timeout, expected.expiry, 'Swap expiry height');
    }

    return end();
  });
});

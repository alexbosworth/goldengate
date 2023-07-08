const {equal} = require('node:assert').strict;
const {rejects} = require('node:assert').strict;
const test = require('node:test');

const {ECPair} = require('ecpair');

const {createSwapOut} = require('./../../');

const expiry = 150;
const serviceKey = Buffer.alloc(33, 3).toString('hex');

const makeService = ({overrides}) => {
  const res = {
    expiry,
    prepay_invoice: 'prepay_invoice',
    sender_key: Buffer.from(serviceKey, 'hex'),
    swap_invoice: 'swap_invoice',
  };

  Object.keys(overrides || {}).forEach(k => res[k] = overrides[k]);

  return {newLoopOutSwap: ({}, {}, cbk) => cbk(null, res)};
};

const makeArgs = overrides => {
  const args = {
    metadata: {},
    network: 'btctestnet',
    service: makeService({}),
    timeout: expiry,
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
    args: makeArgs({metadata: undefined}),
    description: 'Authentication metadata is expected',
    error: [400, 'ExpectedAuthenticationMetadataToCreateSwapOut'],
  },
  {
    args: makeArgs({network: 'network'}),
    description: 'A known network name is expected',
    error: [503, 'FailedToDeriveAddressFromOutputScript'],
  },
  {
    args: makeArgs({service: undefined}),
    description: 'A service object is expected',
    error: [400, 'ExpectedServiceToCreateSwap'],
  },
  {
    args: makeArgs({timeout: undefined}),
    description: 'A timeout height is expected',
    error: [400, 'ExpectedSwapServerTimeoutHeightToCreateSwapOut'],
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
      service: makeService({overrides: {sender_key: ''}}),
    }),
    description: 'A sender key is expected',
    error: [503, 'ExpectedSenderKeyInSwapCreationResponse'],
  },
  {
    args: makeArgs({
      service: {newLoopOutSwap: ({}, {}, cbk) => cbk()},
    }),
    description: 'A response is expected',
    error: [503, 'ExpectedResponseWhenCreatingSwap'],
  },
  {
    args: makeArgs({
      service: {newLoopOutSwap: ({}, {}, cbk) => cbk('err')},
    }),
    description: 'Errors are passed back',
    error: [503, 'UnexpectedErrorCreatingSwap', {err: 'err'}],
  },
  {
    args: makeArgs({
      macaroon: Buffer.alloc(33).toString('base64'),
      preimage: Buffer.alloc(32).toString('hex'),
      service: {
        newLoopOutSwap: ({}, {}, cbk) => cbk({details: 'payment required'}),
      },
    }),
    description: 'Payment required error is passed back',
    error: [402, 'PaymentRequiredToCreateSwap'],
  },
  {
    args: makeArgs({
      service: makeService({overrides: {swap_invoice: undefined}}),
    }),
    description: 'A swap invoice is expected',
    error: [503, 'ExpectedSwapInvoiceInSwapCreationResponse'],
  },
  {
    args: makeArgs({timeout: Infinity}),
    description: 'A reasonable timeout is required',
    error: [500, 'FailedToDeriveSwapScriptWhenCreatingSwap'],
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
  return test(description, async () => {
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

    return;
  });
});

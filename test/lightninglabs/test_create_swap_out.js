const {equal} = require('node:assert').strict;
const {rejects} = require('node:assert').strict;
const test = require('node:test');

const {addressForScript} = require('./../../');
const {createSwapOut} = require('./../../');
const {swapScriptV2} = require('./../../');

const expiry = 150;
const serviceKey = Buffer.alloc(33, 3).toString('hex');

const makeService = ({deadline, overrides}) => {
  const res = {
    expiry,
    prepay_invoice: 'prepay_invoice',
    sender_key: Buffer.from(serviceKey, 'hex'),
    swap_invoice: 'swap_invoice',
  };

  Object.keys(overrides || {}).forEach(k => res[k] = overrides[k]);

  return {
    newLoopOutSwap: (args, {}, cbk) => {
      if (args.swap_publication_deadline !== deadline) {
        return cbk([400, 'InvalidPublicationDeadlineSpecified']);
      }

      return cbk(null, res);
    },
  };
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
      hash: Buffer.alloc(32).toString('hex'),
      secret: Buffer.alloc(32).toString('hex'),
    }),
    description: 'Only a swap hash or a swap secret is expected',
    error: [400, 'ExpectedOnlySwapHashOrSwapSecretNotBoth'],
  },
  {
    args: makeArgs({
      private_key: Buffer.alloc(32, 1).toString('hex'),
      public_key: Buffer.alloc(33, 2).toString('hex'),
    }),
    description: 'Only a private key or a public key is expected',
    error: [400, 'ExpectedOnlyPrivateKeyOrPublicKeyNotBoth'],
  },
  {
    args: makeArgs({private_key: Buffer.alloc(32).toString('hex')}),
    description: 'A valid private key is expected',
    error: [400, 'ExpectedValidPrivateKeyToCreateSwapOut'],
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
      private_key: true,
      secret: true,
      swap_payreq: 'swap_invoice',
    },
  },
  {
    args: makeArgs({
      fund_at: new Date(1e12).toISOString(),
      service: makeService({deadline: '1000000000'}),
    }),
    description: 'Create a swap with a funding deadline',
    expected: {
      expiry,
      prepay: 'prepay_invoice',
      private_key: true,
      secret: true,
      swap_payreq: 'swap_invoice',
    },
  },
  {
    args: makeArgs({public_key: Buffer.alloc(33, 2).toString('hex')}),
    description: 'Create a swap with a public key',
    expected: {
      expiry,
      prepay: 'prepay_invoice',
      private_key: false,
      secret: true,
      swap_payreq: 'swap_invoice',
    },
  },
  {
    args: makeArgs({hash: Buffer.alloc(32).toString('hex')}),
    description: 'Create a swap with a swap hash',
    expected: {
      expiry,
      prepay: 'prepay_invoice',
      private_key: true,
      secret: false,
      swap_payreq: 'swap_invoice',
    },
  },
  {
    args: makeArgs({
      hash: Buffer.alloc(32).toString('hex'),
      public_key: Buffer.alloc(33, 2).toString('hex'),
    }),
    description: 'Create a swap with a public key and a swap hash',
    expected: {
      expiry,
      prepay: 'prepay_invoice',
      private_key: false,
      secret: false,
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

      equal(!!res.private_key, expected.private_key, 'Private key creation');
      equal(!!res.secret, expected.secret, 'Preimage secret creation');
      equal(res.service_public_key, serviceKey, 'Service key returned');
      equal(res.swap_execute_request, expected.prepay, 'Prepay pay request');
      equal(res.swap_fund_request, expected.swap_payreq, 'Swap pay request');
      equal(res.timeout, expected.expiry, 'Swap expiry height');

      // The swap pays to the claim key and the hash that the client holds
      const {script} = swapScriptV2({
        claim_private_key: res.private_key,
        claim_public_key: args.public_key,
        hash: args.hash,
        refund_public_key: serviceKey,
        secret: res.secret,
        timeout: expected.expiry,
      });

      const {address} = addressForScript({script, network: args.network});

      equal(res.script, script, 'Swap script pays to the client');
      equal(res.address, address, 'Swap address pays to the client');
    }

    return;
  });
});

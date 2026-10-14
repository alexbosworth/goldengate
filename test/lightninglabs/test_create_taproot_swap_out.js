const {deepEqual} = require('node:assert').strict;
const {rejects} = require('node:assert').strict;
const test = require('node:test');

const {createTaprootSwapOut} = require('./../../');

const hash = '0001020304050607080900010203040506070809000102030405060708090102';
const request = 'lnbc2500u1pvjluezpp5qqqsyqcyq5rqwzqfqqqsyqcyq5rqwzqfqqqsyqcyq5rqwzqfqypqdq5xysxxatsyp3k7enxv4jsxqzpuaztrnwngzn3kdzw5hydlzf03qdgm2hdq27cqv3agm2awhz5se903vruatfhq77w3ls4evs3ch9zw97j25emudupq63nyw24cg27h2rspfj9srp';
const serviceKey = Buffer.alloc(33, 3).toString('hex');

const makeService = ({overrides}) => {
  const res = {
    prepay_invoice: request,
    sender_key: Buffer.from(serviceKey, 'hex'),
    swap_invoice: request,
  };

  Object.keys(overrides || {}).forEach(k => res[k] = overrides[k]);

  return {
    newLoopOutSwap: (args, {}, cbk) => {
      if (args.protocol_version !== 'MUSIG2') {
        return cbk([400, 'InvalidProtocolVersionSpecified']);
      }

      if (args.swap_publication_deadline !== '1000000000') {
        return cbk([400, 'InvalidPublicationDeadlineSpecified']);
      }

      return cbk(null, res);
    },
  };
};

const makeArgs = overrides => {
  const args = {
    hash,
    fund_at: new Date(1e12).toISOString(),
    metadata: {},
    network: 'btc',
    public_key: Buffer.alloc(33, 2).toString('hex'),
    service: makeService({}),
    timeout: 150,
    tokens: 250000,
  };

  Object.keys(overrides).forEach(k => args[k] = overrides[k]);

  return args;
};

const tests = [
  {
    args: makeArgs({fund_at: undefined}),
    description: 'A funding deadline is expected',
    error: [400, 'ExpectedFundAtDateToCreateTaprootSwapOut'],
  },
  {
    args: makeArgs({hash: undefined}),
    description: 'A swap hash is expected',
    error: [400, 'ExpectedSwapHashToCreateTaprootSwapOut'],
  },
  {
    args: makeArgs({metadata: undefined}),
    description: 'Authentication metadata is expected',
    error: [400, 'ExpectedAuthMetadataToCreateTaprootSwapOut'],
  },
  {
    args: makeArgs({network: undefined}),
    description: 'A network name is expected',
    error: [400, 'ExpectedNetworkToCreateTaprootSwapOut'],
  },
  {
    args: makeArgs({public_key: undefined}),
    description: 'A public key is expected',
    error: [400, 'ExpectedPublicKeyToCreateTaprootSwapOut'],
  },
  {
    args: makeArgs({service: undefined}),
    description: 'A service object is expected',
    error: [400, 'ExpectedServiceToCreateTaprootSwap'],
  },
  {
    args: makeArgs({service: {}}),
    description: 'A service object with a create swap method is expected',
    error: [400, 'ExpectedServiceToCreateTaprootSwap'],
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
      service: {
        newLoopOutSwap: ({}, {}, cbk) => cbk({details: 'payment required'}),
      },
    }),
    description: 'Payment required error is passed back',
    error: [402, 'PaymentRequiredToCreateTaprootSwap'],
  },
  {
    args: makeArgs({
      service: {newLoopOutSwap: ({}, {}, cbk) => cbk('err')},
    }),
    description: 'Errors are passed back',
    error: [503, 'UnexpectedErrorCreatingTaprootSwap', {err: 'err'}],
  },
  {
    args: makeArgs({
      service: {newLoopOutSwap: ({}, {}, cbk) => cbk()},
    }),
    description: 'A response is expected',
    error: [503, 'ExpectedResponseWhenCreatingTaprootSwap'],
  },
  {
    args: makeArgs({
      service: makeService({overrides: {prepay_invoice: undefined}}),
    }),
    description: 'A prepay invoice is expected',
    error: [503, 'ExpectedPrepayInvoiceInTaprootSwapResponse'],
  },
  {
    args: makeArgs({
      service: makeService({overrides: {prepay_invoice: 'prepay_invoice'}}),
    }),
    description: 'A valid prepay invoice is expected',
    error: [
      503,
      'FailedToParseSwapDepositRequestInSwap',
      {err: new Error('ExpectedLnPrefix')},
    ],
  },
  {
    args: makeArgs({
      service: makeService({overrides: {swap_invoice: undefined}}),
    }),
    description: 'A swap invoice is expected',
    error: [503, 'ExpectedSwapInvoiceInTaprootSwapResponse'],
  },
  {
    args: makeArgs({
      service: makeService({overrides: {swap_invoice: 'swap_invoice'}}),
    }),
    description: 'A valid swap invoice is expected',
    error: [
      503,
      'FailedToParseSwapInvoiceInTaprootSwap',
      {err: new Error('ExpectedLnPrefix')},
    ],
  },
  {
    args: makeArgs({hash: Buffer.alloc(32).toString('hex')}),
    description: 'A swap invoice paying to the swap hash is expected',
    error: [503, 'ExpectedFundingRequestToTaprootSwapHash'],
  },
  {
    args: makeArgs({
      service: makeService({overrides: {sender_key: undefined}}),
    }),
    description: 'A sender key is expected',
    error: [503, 'ExpectedPubKeyInTaprootSwapCreationResponse'],
  },
  {
    args: makeArgs({}),
    description: 'Create a taproot swap',
    expected: {
      service_public_key: serviceKey,
      swap_execute_request: request,
      swap_fund_request: request,
    },
  },
];

tests.forEach(({args, description, error, expected}) => {
  return test(description, async () => {
    if (!!error) {
      await rejects(createTaprootSwapOut(args), error, 'Got expected error');
    } else {
      const res = await createTaprootSwapOut(args);

      deepEqual(res, expected, 'Got expected result');
    }

    return;
  });
});

const {deepEqual} = require('node:assert').strict;
const {rejects} = require('node:assert').strict;
const test = require('node:test');

const {createSignedRequest} = require('ln-service');
const {createUnsignedRequest} = require('ln-service');
const {isPointCompressed} = require('tiny-secp256k1');
const {pointFromScalar} = require('tiny-secp256k1');
const {sign} = require('tiny-secp256k1');

const {addressForScript} = require('./../../script');
const {createSwapIn} = require('./../../');
const {swapScriptV2} = require('./../../script');

const clientKey = '031b84c5567b126440995d3ed5aaba0565d71e1834604819ff9c17f5e9d5dd078f';
const id = '0001020304050607080900010203040506070809000102030405060708090102';
const metadata = {get: () => []};
const nonce = Buffer.alloc(66, 2);
const request = 'lnbc2500u1pvjluezpp5qqqsyqcyq5rqwzqfqqqsyqcyq5rqwzqfqqqsyqcyq5rqwzqfqypqdq5xysxxatsyp3k7enxv4jsxqzpuaztrnwngzn3kdzw5hydlzf03qdgm2hdq27cqv3agm2awhz5se903vruatfhq77w3ls4evs3ch9zw97j25emudupq63nyw24cg27h2rspfj9srp';
const serverKey = '024d4b6cd1361032ca9bd2aeb9d900aa4d45d9ead80ac9423374c451a7254d0766';
const timeout = 900;

// The private key of the client key
const privateKey = Buffer.alloc(32, 1).toString('hex');

const utxo = {
  tokens: 251000,
  transaction_id: Buffer.alloc(32, 1).toString('hex'),
  transaction_vout: 1,
};

const {script} = swapScriptV2({
  timeout,
  claim_public_key: serverKey,
  hash: id,
  refund_public_key: clientKey,
});

const {address} = addressForScript({script, network: 'btc'});

// Make a signed payment request on a network
const makeRequest = ({network, tokens}) => {
  const key = Buffer.alloc(32, 1);

  const destination = Buffer.from(pointFromScalar(key)).toString('hex');

  const {hash, hrp, tags} = createUnsignedRequest({
    destination,
    network,
    tokens,
    description: 'description',
    id,
    features: [],
  });

  const signature = sign(Buffer.from(hash, 'hex'), key);

  return createSignedRequest({
    destination,
    hrp,
    tags,
    signature: Buffer.from(signature).toString('hex'),
  }).request;
};

// A swap in on signet pays a signet payment request to a signet address
const signetAddress = addressForScript({script, network: 'btcsignet'}).address;
const signetRequest = makeRequest({network: 'signet', tokens: 250000});

const makeResponse = overrides => {
  const res = {
    extreme_fee_htlc_info: {fee_rate: '10000', nonces: [nonce]},
    high_fee_htlc_info: {fee_rate: '5000', nonces: [nonce]},
    htlc_expiry: timeout,
    htlc_server_pub_key: Buffer.from(serverKey, 'hex'),
    standard_htlc_info: {fee_rate: '2500', nonces: [nonce]},
  };

  Object.keys(overrides || {}).forEach(k => res[k] = overrides[k]);

  return res;
};

// A fake swap service that checks swap requests and keeps swap cancels
const makeService = ({cancelErr, expected, res}) => {
  const cancels = [];

  return {
    cancels,
    pushStaticAddressHtlcSigs: (args, auth, cbk) => {
      if (!!args.standard_htlc_info) {
        return cbk([400, 'ExpectedNoSignaturesToCancelSwap']);
      }

      if (auth !== metadata) {
        return cbk([400, 'ExpectedAuthenticationMetadataPassedThrough']);
      }

      cancels.push(args.swap_hash.toString('hex'));

      return cbk(cancelErr);
    },
    serverStaticAddressLoopIn: (args, auth, cbk) => {
      const outpoint = `${utxo.transaction_id}:${utxo.transaction_vout}`;

      const expectedRequest = {
        amount: undefined,
        deposit_outpoints: [outpoint],
        fast: undefined,
        htlc_client_pub_key: clientKey,
        last_hop: undefined,
        payment_timeout_seconds: 60,
        protocol_version: 'V0',
        swap_hash: id,
        swap_invoice: request,
        user_agent: 'nodejs',
      };

      Object.keys(expected || {}).forEach(k => {
        return expectedRequest[k] = expected[k];
      });

      const got = {
        amount: args.amount,
        deposit_outpoints: args.deposit_outpoints,
        fast: args.fast,
        htlc_client_pub_key: args.htlc_client_pub_key.toString('hex'),
        last_hop: !args.last_hop ? undefined : args.last_hop.toString('hex'),
        payment_timeout_seconds: args.payment_timeout_seconds,
        protocol_version: args.protocol_version,
        swap_hash: args.swap_hash.toString('hex'),
        swap_invoice: args.swap_invoice,
        user_agent: args.user_agent,
      };

      try {
        deepEqual(got, expectedRequest);
      } catch (err) {
        return cbk([400, 'UnexpectedSwapInRequest', {err}]);
      }

      if (auth !== metadata) {
        return cbk([400, 'ExpectedAuthenticationMetadataPassedThrough']);
      }

      return cbk(null, res || makeResponse({}));
    },
  };
};

const makeArgs = overrides => {
  const args = {
    metadata,
    request,
    utxos: [utxo],
    fee: 1000,
    max_timeout_height: timeout,
    public_key: clientKey,
    service: makeService({}),
  };

  Object.keys(overrides).forEach(k => args[k] = overrides[k]);

  return args;
};

// Make arguments for a swap in where the service response has changes
const withResponse = changes => {
  return makeArgs({service: makeService({res: makeResponse(changes)})});
};

// A callback that throws, it is not expected to be called again with an error
const throwingCallback = () => {
  const calls = [];

  return err => {
    calls.push(err);

    if (calls.length > 1 || !!err) {
      throw new Error('UnexpectedCallbackCall');
    }

    throw new Error('CallbackError');
  };
};

// Create a swap in, then see which swaps the service is asked to cancel
const swapOf = async ({args, cbk}) => {
  try {
    const res = await createSwapIn(args, cbk);

    return {cancels: args.service.cancels, swap: res};
  } catch (err) {
    return {err, cancels: args.service.cancels};
  }
};

// The swap in that is made with the default arguments
const swap = {
  address,
  id,
  script,
  fallbacks: [
    {
      fee: 1110,
      fee_tokens_per_kw: 2500,
      nonces: [nonce.toString('hex')],
      type: 'standard',
    },
    {
      fee: 2220,
      fee_tokens_per_kw: 5000,
      nonces: [nonce.toString('hex')],
      type: 'high',
    },
    {
      fee: 4440,
      fee_tokens_per_kw: 10000,
      nonces: [nonce.toString('hex')],
      type: 'extreme',
    },
  ],
  private_key: undefined,
  service_public_key: serverKey,
  timeout: 900,
  tokens: 251000,
};

const tests = [
  {
    args: makeArgs({utxos: undefined}),
    description: 'Utxos are expected',
    error: [400, 'ExpectedUtxosToCreateSwapIn'],
  },
  {
    args: makeArgs({utxos: []}),
    description: 'At least one utxo is expected',
    error: [400, 'ExpectedUtxosToCreateSwapIn'],
  },
  {
    args: makeArgs({utxos: [{tokens: 1, transaction_vout: 0}]}),
    description: 'Valid utxos are expected',
    error: [400, 'ExpectedValidUtxosToCreateSwapIn'],
  },
  {
    args: makeArgs({utxos: [{...utxo, transaction_vout: 4294967296}]}),
    description: 'Valid utxo output indexes are expected',
    error: [400, 'ExpectedValidUtxosToCreateSwapIn'],
  },
  {
    args: makeArgs({utxos: [utxo, utxo]}),
    description: 'Unique utxos are expected',
    error: [400, 'ExpectedUniqueUtxosToCreateSwapIn'],
  },
  {
    args: makeArgs({fee: undefined}),
    description: 'A fee is expected',
    error: [400, 'ExpectedFeeToCreateSwapIn'],
  },
  {
    args: makeArgs({in_through: 'in_through'}),
    description: 'An in through public key is expected',
    error: [400, 'ExpectedInThroughPublicKeyForSwapIn'],
  },
  {
    args: makeArgs({max_timeout_height: undefined}),
    description: 'A max timeout height is expected',
    error: [400, 'ExpectedMaxTimeoutHeightToCreateSwapIn'],
  },
  {
    args: makeArgs({metadata: undefined}),
    description: 'Authentication metadata is expected',
    error: [400, 'ExpectedAuthMetadataToCreateSwapIn'],
  },
  {
    args: makeArgs({payment_timeout_seconds: 1.5}),
    description: 'A whole number of payment timeout seconds is expected',
    error: [400, 'ExpectedPaymentTimeoutSecondsForSwapIn'],
  },
  {
    args: makeArgs({payment_timeout_seconds: 0}),
    description: 'A positive payment timeout is expected',
    error: [400, 'ExpectedPaymentTimeoutSecondsForSwapIn'],
  },
  {
    args: makeArgs({payment_timeout_seconds: 0x100000000}),
    description: 'A payment timeout that fits in 32 bits is expected',
    error: [400, 'ExpectedLowerPaymentTimeoutForSwapIn'],
  },
  {
    args: makeArgs({public_key: clientKey.slice(2)}),
    description: 'A compressed public key is expected',
    error: [400, 'ExpectedValidPublicKeyToCreateSwapIn'],
  },
  {
    args: makeArgs({public_key: `02${'0'.repeat(62)}05`}),
    description: 'A valid public key is expected',
    error: [400, 'ExpectedValidPublicKeyToCreateSwapIn'],
  },
  {
    args: makeArgs({request: undefined}),
    description: 'A payment request is expected',
    error: [400, 'ExpectedPaymentRequestToCreateSwapIn'],
  },
  {
    args: makeArgs({service: undefined}),
    description: 'A service is expected',
    error: [400, 'ExpectedServiceToCreateSwapIn'],
  },
  {
    args: makeArgs({service: {serverStaticAddressLoopIn: () => {}}}),
    description: 'A service that can cancel a swap is expected',
    error: [400, 'ExpectedServiceToCreateSwapIn'],
  },
  {
    args: makeArgs({private_key: 'zz', public_key: undefined}),
    description: 'A valid private key is expected',
    error: [400, 'ExpectedValidPrivateKeyToCreateSwapIn'],
  },
  {
    args: makeArgs({request: 'request'}),
    description: 'A valid payment request is expected',
    error: [
      400,
      'ExpectedValidRequestToCreateSwapIn',
      {err: new Error('ExpectedLnPrefix')},
    ],
  },
  {
    args: makeArgs({request: makeRequest({network: 'simnet', tokens: 1e5})}),
    description: 'A payment request on a known network is expected',
    error: [400, 'ExpectedKnownNetworkForSwapInRequest'],
  },
  {
    args: makeArgs({request: makeRequest({network: 'bitcoin'})}),
    description: 'A payment request with tokens is expected',
    error: [400, 'ExpectedRequestTokensToCreateSwapIn'],
  },
  {
    args: makeArgs({utxos: [{...utxo, tokens: 250999}]}),
    description: 'Utxos must cover the swap tokens',
    error: [400, 'ExpectedUtxosToCoverSwapInTokens'],
  },
  {
    args: makeArgs({utxos: [{...utxo, tokens: 251100}]}),
    description: 'Change back to the shared address cannot be dust',
    error: [400, 'ExpectedNonDustChangeForSwapIn', {change: 100}],
  },
  {
    args: makeArgs({
      service: {
        pushStaticAddressHtlcSigs: () => {},
        serverStaticAddressLoopIn: ({}, {}, cbk) => {
          return cbk({details: 'payment required'});
        },
      },
    }),
    description: 'Payment required error is passed back',
    error: [402, 'PaymentRequiredToCreateSwapIn'],
  },
  {
    args: makeArgs({
      service: {
        pushStaticAddressHtlcSigs: () => {},
        serverStaticAddressLoopIn: ({}, {}, cbk) => cbk('err'),
      },
    }),
    description: 'Errors are passed back',
    error: [503, 'UnexpectedErrorCreatingSwapIn', {err: 'err'}],
  },
  {
    args: makeArgs({
      public_key: undefined,
      service: {
        pushStaticAddressHtlcSigs: () => {},
        serverStaticAddressLoopIn: (args, {}, cbk) => {
          return cbk({is_key: isPointCompressed(args.htlc_client_pub_key)});
        },
      },
    }),
    description: 'A new refund key is sent when there is no refund key',
    error: [503, 'UnexpectedErrorCreatingSwapIn', {err: {is_key: true}}],
  },
  {
    args: makeArgs({
      service: {
        pushStaticAddressHtlcSigs: () => {},
        serverStaticAddressLoopIn: ({}, {}, cbk) => cbk(),
      },
    }),
    description: 'A response is expected',
    error: [503, 'ExpectedResponseWhenCreatingSwapIn'],
  },
  {
    args: makeArgs({}),
    description: 'Create a swap in',
    expected: {swap, cancels: []},
  },
  {
    args: makeArgs({
      request: signetRequest,
      service: makeService({expected: {swap_invoice: signetRequest}}),
    }),
    description: 'Create a swap in on signet',
    expected: {swap: {...swap, address: signetAddress}, cancels: []},
  },
  {
    args: makeArgs({
      service: makeService({expected: {amount: '251000'}}),
      utxos: [{...utxo, tokens: 300000}],
    }),
    description: 'Create a swap in with change',
    expected: {
      cancels: [],
      swap: {
        ...swap,
        fallbacks: [
          {...swap.fallbacks[0], fee: 1540},
          {...swap.fallbacks[1], fee: 3080},
          {...swap.fallbacks[2], fee: 6160},
        ],
      },
    },
  },
  {
    args: makeArgs({
      in_through: serverKey,
      is_fast: true,
      payment_timeout_seconds: 120,
      service: makeService({
        expected: {
          fast: true,
          last_hop: serverKey,
          payment_timeout_seconds: 120,
          user_agent: 'agent',
        },
      }),
      user_agent: 'agent',
    }),
    description: 'Create a fast swap in through a peer',
    expected: {swap, cancels: []},
  },
  {
    args: withResponse({
      extreme_fee_htlc_info: {
        fee_rate: '10000',
        nonces: [nonce.toString('base64')],
      },
      high_fee_htlc_info: {
        fee_rate: '5000',
        nonces: [nonce.toString('base64')],
      },
      htlc_server_pub_key: Buffer.from(serverKey, 'hex').toString('base64'),
      standard_htlc_info: {
        fee_rate: '2500',
        nonces: [nonce.toString('base64')],
      },
    }),
    description: 'Create a swap in from base64 encoded data',
    expected: {swap, cancels: []},
  },
  {
    args: withResponse({
      high_fee_htlc_info: {fee_rate: '150000', nonces: [nonce]},
    }),
    description: 'A backup HTLC fee can go above the standard fee limit',
    expected: {
      cancels: [],
      swap: {
        ...swap,
        fallbacks: [
          swap.fallbacks[0],
          {...swap.fallbacks[1], fee: 66600, fee_tokens_per_kw: 150000},
          swap.fallbacks[2],
        ],
      },
    },
  },
  {
    args: makeArgs({private_key: privateKey, public_key: undefined}),
    description: 'A refund private key is used to make the refund public key',
    expected: {cancels: [], swap: {...swap, private_key: privateKey}},
  },
  {
    args: withResponse({htlc_server_pub_key: undefined}),
    description: 'A swap without a server HTLC key is canceled',
    expected: {
      cancels: [id],
      err: [503, 'ExpectedServerHtlcKeyForSwapIn'],
    },
  },
  {
    args: withResponse({htlc_server_pub_key: Buffer.alloc(33)}),
    description: 'A swap with an invalid server HTLC key is canceled',
    expected: {
      cancels: [id],
      err: [503, 'ExpectedValidServerHtlcKeyForSwapIn'],
    },
  },
  {
    args: withResponse({htlc_expiry: 0}),
    description: 'A swap without an HTLC timeout is canceled',
    expected: {
      cancels: [id],
      err: [503, 'ExpectedHtlcTimeoutForSwapIn'],
    },
  },
  {
    args: withResponse({htlc_expiry: timeout + 1}),
    description: 'A swap with an HTLC timeout over the max is canceled',
    expected: {
      cancels: [id],
      err: [503, 'ExpectedLowerHtlcTimeoutForSwapIn'],
    },
  },
  {
    args: makeArgs({
      max_timeout_height: 5e8,
      service: makeService({res: makeResponse({htlc_expiry: 5e8})}),
    }),
    description: 'A swap with an HTLC timeout past block heights is canceled',
    expected: {
      cancels: [id],
      err: [
        500,
        'FailedToDeriveServiceFallbackScript',
        {err: new Error('FailedToComposeSwapScriptElements')},
      ],
    },
  },
  {
    args: withResponse({extreme_fee_htlc_info: null}),
    description: 'A swap without signing info for a fee rate is canceled',
    expected: {
      cancels: [id],
      err: [503, 'ExpectedFallbackSigningInfoForSwapIn'],
    },
  },
  {
    args: withResponse({
      high_fee_htlc_info: {fee_rate: '5000', nonces: [nonce, nonce]},
    }),
    description: 'A swap without one nonce for every utxo is canceled',
    expected: {
      cancels: [id],
      err: [503, 'ExpectedNonceForEverySwapInUtxo'],
    },
  },
  {
    args: withResponse({
      standard_htlc_info: {fee_rate: '2500', nonces: [Buffer.alloc(65)]},
    }),
    description: 'A swap with an invalid nonce is canceled',
    expected: {
      cancels: [id],
      err: [503, 'ExpectedValidNoncesForSwapIn'],
    },
  },
  {
    args: withResponse({
      standard_htlc_info: {fee_rate: 'fee_rate', nonces: [nonce]},
    }),
    description: 'A swap with an invalid fee rate is canceled',
    expected: {
      cancels: [id],
      err: [503, 'ExpectedFallbackFeeRateForSwapIn'],
    },
  },
  {
    args: withResponse({
      standard_htlc_info: {fee_rate: '120000', nonces: [nonce]},
    }),
    description: 'A swap with a standard HTLC fee over the limit is canceled',
    expected: {
      cancels: [id],
      err: [503, 'ExpectedLowerFallbackFeeForSwapIn', {type: 'standard'}],
    },
  },
  {
    args: withResponse({
      extreme_fee_htlc_info: {fee_rate: '300000', nonces: [nonce]},
    }),
    description: 'A swap with a backup HTLC fee over the limit is canceled',
    expected: {
      cancels: [id],
      err: [503, 'ExpectedLowerFallbackFeeForSwapIn', {type: 'extreme'}],
    },
  },
  {
    args: makeArgs({
      service: makeService({
        cancelErr: 'err',
        res: makeResponse({htlc_expiry: 0}),
      }),
    }),
    description: 'A failure to cancel returns the original error',
    expected: {
      cancels: [id],
      err: [503, 'ExpectedHtlcTimeoutForSwapIn'],
    },
  },
  {
    args: makeArgs({}),
    cbk: throwingCallback(),
    description: 'A callback that throws does not cancel the swap',
    expected: {cancels: [], err: new Error('CallbackError')},
  },
];

tests.forEach(({args, cbk, description, error, expected}) => {
  return test(description, async () => {
    if (!!error) {
      await rejects(createSwapIn(args), error, 'Got error');
    } else {
      deepEqual(await swapOf({args, cbk}), expected, 'Got swap');
    }

    return;
  });
});

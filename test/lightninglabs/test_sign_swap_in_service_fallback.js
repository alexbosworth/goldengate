const {createHash} = require('node:crypto');
const {deepEqual} = require('node:assert').strict;
const {rejects} = require('node:assert').strict;
const test = require('node:test');

const {sharedAddressScript} = require('./../../');
const {signSwapInServiceFallback} = require('./../../');
const {swapInServiceFallbackTx} = require('./../../');
const {swapScriptV2} = require('./../../');

const clientKey = '031b84c5567b126440995d3ed5aaba0565d71e1834604819ff9c17f5e9d5dd078f';
const expiry = 14400;
const id = Buffer.alloc(32, 9).toString('hex');
const infoKeys = {
  extreme: 'extreme_fee_htlc_info',
  high: 'high_fee_htlc_info',
  standard: 'standard_htlc_info',
};
const metadata = {get: () => []};
const serviceKey = '024d4b6cd1361032ca9bd2aeb9d900aa4d45d9ead80ac9423374c451a7254d0766';
const serviceNonce = (i, vin) => Buffer.alloc(66, 16 + i * 2 + vin);
const sessionId = n => Buffer.alloc(32, n).toString('hex');
const sha256 = hex => createHash('sha256').update(Buffer.from(hex, 'hex'));

const utxos = [
  {
    tokens: 200000,
    transaction_id: sha256('01').digest('hex'),
    transaction_vout: 1,
  },
  {
    tokens: 100000,
    transaction_id: sha256('02').digest('hex'),
    transaction_vout: 3,
  },
];

const address = sharedAddressScript({
  expiry,
  client_public_key: clientKey,
  network: 'btc',
  server_public_key: serviceKey,
});

const {script} = swapScriptV2({
  claim_public_key: serviceKey,
  hash: id,
  refund_public_key: clientKey,
  timeout: 900,
});

// The service nonces differ for every HTLC type and utxo
const fallbacks = ['standard', 'high', 'extreme'].map((type, i) => ({
  type,
  fee_tokens_per_kw: [2500, 5000, 10000][i],
  nonces: utxos.map((utxo, vin) => serviceNonce(i, vin).toString('hex')),
}));

// More inputs to sign than are signed at once
const many = Array.from({length: 5}, (_, i) => ({
  tokens: 100000,
  transaction_id: sha256(`0${i + 3}`).digest('hex'),
  transaction_vout: i,
}));

// The service nonces for many inputs
const manyFallbacks = fallbacks.map((fallback, i) => ({
  ...fallback,
  nonces: many.map((_, vin) => Buffer.alloc(66, 64 + i * 8 + vin)),
}))
.map(fallback => ({
  ...fallback,
  nonces: fallback.nonces.map(n => n.toString('hex')),
}));

// Sign the extreme fee HTLC first, then the standard and high fee HTLCs
const order = [2, 0, 1];

// The unsigned HTLC transactions of fallbacks that spend utxos
const unsignedFor = spend => spend.fallbacks.map(fallback => {
  return swapInServiceFallbackTx({
    script,
    fee_tokens_per_kw: fallback.fee_tokens_per_kw,
    output_script: address.output_script,
    tokens: 251000,
    utxos: spend.utxos,
  });
});

// A fake LND signer: partial signatures commit to the digest and nonce
const makeLnd = ({cleanupErr, createErr, registerErr, sessionKey}) => {
  const cleaned = [];
  const registered = {};
  const state = {sessions: 0};

  // Sessions have the shared address key unless another key is given
  const combinedKey = sessionKey || address.output_script.slice(4);

  return {
    cleaned,
    signer: {
      muSig2Cleanup: ({session_id}, cbk) => {
        cleaned.push(session_id.toString('hex'));

        return cbk(cleanupErr);
      },
      muSig2CombineSig: ({}, cbk) => cbk([500, 'UnexpectedCombineSigRequest']),
      muSig2CreateSession: (args, cbk) => {
        if (!!createErr) {
          return cbk(createErr);
        }

        const keys = args.all_signer_pubkeys.map(n => n.toString('hex'));

        if (keys.join() !== [clientKey, serviceKey].join()) {
          return cbk([400, 'ExpectedClientAndServiceKeysForSession']);
        }

        if (args.key_loc.key_family !== 42060) {
          return cbk([400, 'ExpectedSharedAddressKeyFamily']);
        }

        if (args.key_loc.key_index !== 7) {
          return cbk([400, 'ExpectedSharedAddressKeyIndex']);
        }

        const root = args.taproot_tweak.script_root.toString('hex');

        if (root !== address.root_hash) {
          return cbk([400, 'ExpectedSharedAddressScriptRootTweak']);
        }

        if (args.version !== 'MUSIG2_VERSION_V100RC2') {
          return cbk([400, 'ExpectedMuSig2Version1RC2']);
        }

        state.sessions++;

        return cbk(null, {
          combined_key: Buffer.from(combinedKey, 'hex'),
          local_public_nonces: Buffer.alloc(66, state.sessions),
          session_id: Buffer.alloc(32, state.sessions),
          taproot_internal_key: Buffer.from(address.internal_key, 'hex'),
        });
      },
      muSig2RegisterNonces: (args, cbk) => {
        if (!!registerErr) {
          return cbk(registerErr);
        }

        const [nonce] = args.other_signer_public_nonces;

        registered[args.session_id.toString('hex')] = nonce.toString('hex');

        return cbk(null, {have_all_nonces: true});
      },
      muSig2Sign: (args, cbk) => {
        const nonce = registered[args.session_id.toString('hex')];

        const digest = args.message_digest.toString('hex');

        return cbk(null, {
          local_partial_signature: sha256(`${digest}${nonce}`).digest(),
        });
      },
    },
    wallet: {
      deriveKey: ({}, cbk) => cbk(null, {
        key_loc: {key_index: 7},
        raw_key_bytes: Buffer.from(clientKey, 'hex'),
      }),
    },
  };
};

// A fake LND where sessions that are started later are ready first
const makeSlowLnd = () => {
  const lnd = makeLnd({});
  const state = {calls: 0};

  const {muSig2CreateSession} = lnd.signer;

  lnd.signer.muSig2CreateSession = (args, cbk) => {
    const delay = 30 - state.calls++;

    return muSig2CreateSession(args, (err, res) => {
      return setTimeout(() => cbk(err, res), delay);
    });
  };

  return lnd;
};

// A fake service that keeps the pushes of HTLC signatures
const makeService = () => {
  const pushes = [];

  return {
    pushes,
    pushStaticAddressHtlcSigs: (args, auth, cbk) => {
      if (auth !== metadata) {
        return cbk([400, 'ExpectedAuthenticationMetadataPassedThrough']);
      }

      pushes.push(args);

      return cbk();
    },
  };
};

const makeArgs = overrides => {
  const args = {
    utxos,
    expiry,
    fallbacks,
    id,
    metadata,
    script,
    key_family: 42060,
    key_index: 7,
    lnd: makeLnd({}),
    network: 'btc',
    service: makeService(),
    service_public_key: serviceKey,
    tokens: 251000,
  };

  Object.keys(overrides).forEach(k => args[k] = overrides[k]);

  return args;
};

// The ids of the sessions that are numbered from one
const idsFrom = count => [...Array(count).keys()].map(n => sessionId(n + 1));

// Sessions are numbered from one in the order that the inputs are signed
const signingInfo = ({fallback, hashes, i}) => ({
  nonces: hashes.map((hash, vin) => {
    return Buffer.alloc(66, i * hashes.length + vin + 1);
  }),
  sigs: hashes.map((hash, vin) => {
    return sha256(`${hash}${fallback.nonces[vin]}`).digest();
  }),
});

// The push of nonces and partial signatures for the HTLCs in signing order
const pushFor = signed => signed.fallbacks.reduce((sum, fallback, i) => {
  const {hashes} = signed.txs[i];

  sum[infoKeys[fallback.type]] = signingInfo({fallback, hashes, i});

  return sum;
},
{swap_hash: Buffer.from(id, 'hex')});

// The signing of HTLCs that are passed in an order
const signingFor = signing => {
  const txs = unsignedFor(signing);

  return {
    cleaned: signing.cleaned,
    pushes: [pushFor({txs, fallbacks: signing.fallbacks})],
    transactions: txs.map((tx, i) => ({
      id: tx.id,
      transaction: tx.transaction,
      type: signing.fallbacks[i].type,
    })),
  };
};

// Sign the HTLCs, then see what is pushed and which sessions are cleaned up
const signingOf = async args => {
  const {pushes} = args.service;

  try {
    const {transactions} = await signSwapInServiceFallback(args);

    return {pushes, transactions, cleaned: args.lnd.cleaned.slice().sort()};
  } catch (err) {
    return {err, pushes, cleaned: args.lnd.cleaned.slice().sort()};
  }
};

const tests = [
  {
    args: makeArgs({utxos: undefined}),
    description: 'Utxos are expected',
    error: [400, 'ExpectedUtxosToSignServiceFallback'],
  },
  {
    args: makeArgs({expiry: undefined}),
    description: 'A shared address expiry is expected',
    error: [400, 'ExpectedAddressExpiryToSignServiceFallback'],
  },
  {
    args: makeArgs({fallbacks: undefined}),
    description: 'HTLCs are expected',
    error: [400, 'ExpectedFallbacksToSignServiceFallback'],
  },
  {
    args: makeArgs({fallbacks: fallbacks.slice(1)}),
    description: 'Every HTLC type is expected',
    error: [400, 'ExpectedEveryFallbackTypeToSignServiceFallback'],
  },
  {
    args: makeArgs({fallbacks: [fallbacks[0], fallbacks[0], fallbacks[2]]}),
    description: 'Each HTLC type is expected once',
    error: [400, 'ExpectedEveryFallbackTypeToSignServiceFallback'],
  },
  {
    args: makeArgs({fallbacks: fallbacks.concat(fallbacks[0])}),
    description: 'An extra HTLC is not signed',
    error: [400, 'ExpectedEveryFallbackTypeToSignServiceFallback'],
  },
  {
    args: makeArgs({
      fallbacks: [
        {...fallbacks[0], fee_tokens_per_kw: '1'},
        fallbacks[1],
        fallbacks[2],
      ],
    }),
    description: 'HTLC fee rates are expected',
    error: [400, 'ExpectedFallbackFeeRatesToSignServiceFallback'],
  },
  {
    args: makeArgs({
      fallbacks: [
        {...fallbacks[0], nonces: ['00']},
        fallbacks[1],
        fallbacks[2],
      ],
    }),
    description: 'Valid HTLC nonces are expected',
    error: [400, 'ExpectedFallbackNoncesToSignServiceFallback'],
  },
  {
    args: makeArgs({
      fallbacks: [
        {...fallbacks[0], nonces: [fallbacks[0].nonces[0]]},
        fallbacks[1],
        fallbacks[2],
      ],
    }),
    description: 'A nonce for every utxo is expected',
    error: [400, 'ExpectedNonceForEveryUtxoToSignServiceFallback'],
  },
  {
    args: makeArgs({id: undefined}),
    description: 'A swap hash is expected',
    error: [400, 'ExpectedSwapHashToSignServiceFallback'],
  },
  {
    args: makeArgs({key_family: undefined}),
    description: 'A key family is expected',
    error: [400, 'ExpectedKeyFamilyToSignServiceFallback'],
  },
  {
    args: makeArgs({key_index: undefined}),
    description: 'A key index is expected',
    error: [400, 'ExpectedKeyIndexToSignServiceFallback'],
  },
  {
    args: makeArgs({lnd: undefined}),
    description: 'An LND object is expected',
    error: [400, 'ExpectedAuthenticatedLndToSignServiceFallback'],
  },
  {
    args: makeArgs({metadata: undefined}),
    description: 'Authentication metadata is expected',
    error: [400, 'ExpectedAuthMetadataToSignServiceFallback'],
  },
  {
    args: makeArgs({network: undefined}),
    description: 'A network name is expected',
    error: [400, 'ExpectedNetworkNameToSignServiceFallback'],
  },
  {
    args: makeArgs({script: undefined}),
    description: 'An HTLC script is expected',
    error: [400, 'ExpectedHtlcScriptToSignServiceFallback'],
  },
  {
    args: makeArgs({service: {}}),
    description: 'A service to push signatures to is expected',
    error: [400, 'ExpectedServiceToSignServiceFallback'],
  },
  {
    args: makeArgs({service_public_key: undefined}),
    description: 'A shared address service key is expected',
    error: [400, 'ExpectedServiceKeyToSignServiceFallback'],
  },
  {
    args: makeArgs({tokens: undefined}),
    description: 'Swap tokens are expected',
    error: [400, 'ExpectedSwapTokensToSignServiceFallback'],
  },
  {
    args: makeArgs({expiry: 0}),
    description: 'A valid shared address is expected',
    error: [
      400,
      'FailedToDeriveSharedAddressToSignFallback',
      {err: new Error('ExpectedExpiryBlocksCountForSharedAddressScript')},
    ],
  },
  {
    args: makeArgs({tokens: 300001}),
    description: 'Valid HTLC transactions are expected',
    error: [
      400,
      'FailedToBuildServiceFallbackTx',
      {err: new Error('ExpectedUtxosToCoverServiceFallbackTokens')},
    ],
  },
  {
    args: makeArgs({
      service: {pushStaticAddressHtlcSigs: ({}, {}, cbk) => cbk('err')},
    }),
    description: 'Errors pushing signatures are passed back',
    error: [503, 'UnexpectedErrorPushingFallbackSigs', {err: 'err'}],
  },
  {
    args: makeArgs({lnd: makeLnd({sessionKey: address.internal_key})}),
    description: 'A session key that is not the shared address is rejected',
    expected: {
      cleaned: idsFrom(1),
      err: [503, 'UnexpectedSessionKeyForSharedAddress'],
      pushes: [],
    },
  },
  {
    args: makeArgs({lnd: makeLnd({registerErr: 'err'})}),
    description: 'A failure to sign cleans up the signing session',
    expected: {
      cleaned: idsFrom(1),
      err: [503, 'UnexpectedErrorUpdatingMuSig2Session', {err: 'err'}],
      pushes: [],
    },
  },
  {
    args: makeArgs({lnd: makeLnd({createErr: 'err'})}),
    description: 'A failure to start a signing session is passed back',
    expected: {
      cleaned: [],
      err: [503, 'UnexpectedErrorCreatingMuSig2Session', {err: 'err'}],
      pushes: [],
    },
  },
  {
    args: makeArgs({}),
    description: 'Sign swap in HTLC transactions',
    expected: signingFor({fallbacks, utxos, cleaned: idsFrom(6)}),
  },
  {
    args: makeArgs({fallbacks: order.map(i => fallbacks[i])}),
    description: 'HTLCs can be passed in any order',
    expected: signingFor({
      utxos,
      cleaned: idsFrom(6),
      fallbacks: order.map(i => fallbacks[i]),
    }),
  },
  {
    args: makeArgs({
      fallbacks: manyFallbacks,
      lnd: makeSlowLnd(),
      utxos: many,
    }),
    description: 'Inputs signed in parallel are pushed in order',
    expected: signingFor({
      cleaned: idsFrom(15),
      fallbacks: manyFallbacks,
      utxos: many,
    }),
  },
  {
    args: makeArgs({lnd: makeLnd({cleanupErr: 'err'})}),
    description: 'A failure to clean up a session is not an error',
    expected: signingFor({fallbacks, utxos, cleaned: idsFrom(6)}),
  },
];

tests.forEach(({args, description, error, expected}) => {
  return test(description, async () => {
    if (!!error) {
      await rejects(signSwapInServiceFallback(args), error, 'Got error');
    } else {
      deepEqual(await signingOf(args), expected, 'Got expected signing');
    }

    return;
  });
});

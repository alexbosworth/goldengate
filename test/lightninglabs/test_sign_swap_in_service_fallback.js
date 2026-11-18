const {createHash} = require('node:crypto');
const {deepEqual} = require('node:assert').strict;
const {rejects} = require('node:assert').strict;
const test = require('node:test');

const {makeLnd} = require('mock-lnd');
const {makeRpcError} = require('mock-lnd');

const {sharedAddressCosigner} = require('./../macros');
const {sharedAddressScript} = require('./../../');
const {signSwapInServiceFallback} = require('./../../');
const {swapInServiceFallbackTx} = require('./../../');
const {swapScriptV2} = require('./../../');

const bufferAsHex = buffer => Buffer.from(buffer).toString('hex');
const clientKey = '031b84c5567b126440995d3ed5aaba0565d71e1834604819ff9c17f5e9d5dd078f';
const clientSecret = Buffer.alloc(32, 1).toString('hex');
const expiry = 14400;
const id = Buffer.alloc(32, 9).toString('hex');
const infoKeys = {
  extreme: 'extreme_fee_htlc_info',
  high: 'high_fee_htlc_info',
  standard: 'standard_htlc_info',
};
const metadata = {get: () => []};
const range = count => [...Array(count).keys()];
const serviceKey = '024d4b6cd1361032ca9bd2aeb9d900aa4d45d9ead80ac9423374c451a7254d0766';
const sha256 = hex => createHash('sha256').update(Buffer.from(hex, 'hex'));
const types = ['standard', 'high', 'extreme'];

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

// More inputs to sign than are signed at once
const many = range(5).map(i => ({
  tokens: 100000,
  transaction_id: sha256(`0${i + 3}`).digest('hex'),
  transaction_vout: i,
}));

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

// A fake swap service that keeps the pushes of HTLC signatures
const makeService = () => {
  const cosigner = sharedAddressCosigner({
    client_public_key: clientKey,
    root_hash: address.root_hash,
  });

  const pushes = [];

  // Every service starts the same sessions in order, so the nonces match
  const noncesFor = (inputs, set) => types.map(type => {
    return inputs.map((utxo, vin) => {
      return cosigner.nonceFor(`${set}:${type}:${vin}`);
    });
  });

  return {
    cosigner,
    pushes,
    many: noncesFor(many, 'many'),
    nonces: noncesFor(utxos, 'utxos'),
    pushStaticAddressHtlcSigs: (args, auth, cbk) => {
      if (auth !== metadata) {
        return cbk([400, 'ExpectedAuthenticationMetadataPassedThrough']);
      }

      pushes.push(args);

      return cbk();
    },
  };
};

// The service nonces for the utxos, and for many utxos
const serviceNonces = makeService();

// The service nonces differ for every HTLC type and utxo
const fallbacks = types.map((type, i) => ({
  type,
  fee_tokens_per_kw: [2500, 5000, 10000][i],
  nonces: serviceNonces.nonces[i],
}));

// The service nonces for many inputs
const manyFallbacks = fallbacks.map((fallback, i) => ({
  ...fallback,
  nonces: serviceNonces.many[i],
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

// A fake LND with the client key of the shared address
const clientLnd = args => makeLnd({
  failures: args.failures,
  keys: [{family: 42060, index: 7, secret: clientSecret}],
});

// A fake LND where a signer method fails
const failingLnd = method => clientLnd({
  failures: [{method, details: 'err', type: 'signer'}],
});

// A fake LND that gives signing sessions a key that is not the address key
const otherKeyLnd = () => {
  const lnd = clientLnd({});

  const {muSig2CreateSession} = lnd.signer;

  lnd.signer.muSig2CreateSession = (args, cbk) => {
    return muSig2CreateSession(args, (err, res) => {
      const internalKey = res.taproot_internal_key;

      return cbk(err, {...res, combined_key: internalKey});
    });
  };

  return lnd;
};

// A fake LND where sessions that are started later are ready first
const makeSlowLnd = () => {
  const lnd = clientLnd({});
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
    lnd: clientLnd({}),
    network: 'btc',
    service: makeService(),
    service_public_key: serviceKey,
    tokens: 251000,
  };

  Object.keys(overrides).forEach(k => args[k] = overrides[k]);

  return args;
};

// The sessions that the client LND started, in the order they were started
const startedSessions = ({calls}) => calls
  .filter(n => n.method === 'muSig2CreateSession' && !!n.response)
  .map(n => n.response);

// The indexes of the started sessions that the client LND was asked to end
const cleanedSessions = lnd => {
  const sessions = startedSessions(lnd);

  const cleaned = lnd.calls.filter(n => n.method === 'muSig2Cleanup');

  return cleaned.map(call => {
    return sessions.findIndex(session => {
      return session.session_id.equals(call.args.session_id);
    });
  })
  .sort((a, b) => a - b);
};

// Check the client signatures of a push combine into valid signatures
const checkedPush = ({args, push}) => {
  const txs = unsignedFor(args);
  const {cosigner} = args.service;

  return args.fallbacks.reduce((sum, fallback, i) => {
    const info = push[infoKeys[fallback.type]];

    const signed = txs[i].hashes.map((hash, vin) => {
      return cosigner.isComplete({
        hash,
        key: cosigner.keyFor(fallback.nonces[vin]),
        nonce: bufferAsHex(info.nonces[vin]),
        signature: bufferAsHex(info.sigs[vin]),
      });
    });

    // Counts show nonces or signatures that are pushed for no input
    sum[infoKeys[fallback.type]] = {
      signed,
      nonces_count: info.nonces.length,
      sigs_count: info.sigs.length,
    };

    return sum;
  },
  {fields: Object.keys(push).sort(), swap_hash: push.swap_hash});
};

// The push of signatures for the HTLCs, with a valid signature per input
const pushFor = signing => {
  const infos = signing.fallbacks.map(n => infoKeys[n.type]);

  return signing.fallbacks.reduce((sum, fallback) => {
    sum[infoKeys[fallback.type]] = {
      nonces_count: signing.utxos.length,
      signed: signing.utxos.map(() => true),
      sigs_count: signing.utxos.length,
    };

    return sum;
  },
  {
    fields: infos.concat('swap_hash').sort(),
    swap_hash: Buffer.from(id, 'hex'),
  });
};

// The signing of HTLCs that are passed in an order
const signingFor = signing => {
  const txs = unsignedFor(signing);

  return {
    cleaned: signing.cleaned,
    pushes: [pushFor(signing)],
    transactions: txs.map((tx, i) => ({
      id: tx.id,
      transaction: tx.transaction,
      type: signing.fallbacks[i].type,
    })),
  };
};

// Sign the HTLCs, then see what is pushed and which sessions are cleaned up
const signingOf = async args => {
  const cleaned = () => cleanedSessions(args.lnd);

  const pushes = () => args.service.pushes.map(push => {
    return checkedPush({args, push});
  });

  try {
    const {transactions} = await signSwapInServiceFallback(args);

    return {transactions, cleaned: cleaned(), pushes: pushes()};
  } catch (err) {
    return {err, cleaned: cleaned(), pushes: pushes()};
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
    args: makeArgs({
      fallbacks: [
        {...fallbacks[0], nonces: manyFallbacks[0].nonces.slice(0, 3)},
        fallbacks[1],
        fallbacks[2],
      ],
    }),
    description: 'A nonce for a utxo that is not spent is not expected',
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
    args: makeArgs({lnd: otherKeyLnd()}),
    description: 'A session key that is not the shared address is rejected',
    expected: {
      cleaned: [0],
      err: [503, 'UnexpectedSessionKeyForSharedAddress'],
      pushes: [],
    },
  },
  {
    args: makeArgs({lnd: failingLnd('muSig2RegisterNonces')}),
    description: 'A failure to sign cleans up the signing session',
    expected: {
      cleaned: [0],
      err: [
        503,
        'UnexpectedErrorUpdatingMuSig2Session',
        {err: makeRpcError({details: 'err'})},
      ],
      pushes: [],
    },
  },
  {
    args: makeArgs({lnd: failingLnd('muSig2CreateSession')}),
    description: 'A failure to start a signing session is passed back',
    expected: {
      cleaned: [],
      err: [
        503,
        'UnexpectedErrorCreatingMuSig2Session',
        {err: makeRpcError({details: 'err'})},
      ],
      pushes: [],
    },
  },
  {
    args: makeArgs({}),
    description: 'Sign swap in HTLC transactions',
    expected: signingFor({fallbacks, utxos, cleaned: range(6)}),
  },
  {
    args: makeArgs({fallbacks: order.map(i => fallbacks[i])}),
    description: 'HTLCs can be passed in any order',
    expected: signingFor({
      utxos,
      cleaned: range(6),
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
      cleaned: range(15),
      fallbacks: manyFallbacks,
      utxos: many,
    }),
  },
  {
    args: makeArgs({lnd: failingLnd('muSig2Cleanup')}),
    description: 'A failure to clean up a session is not an error',
    expected: signingFor({fallbacks, utxos, cleaned: range(6)}),
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

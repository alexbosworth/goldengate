const {createHash} = require('node:crypto');
const {deepEqual} = require('node:assert').strict;
const {rejects} = require('node:assert').strict;
const test = require('node:test');

const {componentsOfTransaction} = require('@alexbosworth/blockchain');
const {decodePsbt} = require('psbt');
const {idForTransaction} = require('@alexbosworth/blockchain');
const {makeLnd} = require('mock-lnd');
const {makeRpcError} = require('mock-lnd');
const {v1HashToSign} = require('p2tr');

const {sharedAddressCosigner} = require('./../macros');
const {sharedAddressScript} = require('./../../');
const {spendSharedUtxos} = require('./../../');

const badInfo = {nonce: Buffer.alloc(65), sig: Buffer.alloc(32)};
const badSig = {nonce: Buffer.alloc(66), sig: Buffer.alloc(31)};
const bufferAsHex = buffer => Buffer.from(buffer).toString('hex');
const clientKey = '031b84c5567b126440995d3ed5aaba0565d71e1834604819ff9c17f5e9d5dd078f';
const clientSecret = Buffer.alloc(32, 1).toString('hex');
const expiry = 14400;
const hexAsBuffer = hex => Buffer.from(hex, 'hex');
const invalidSignature = 'error combining signatures: error combining partial signature: error combining partial signature: final signature is invalid';
const metadata = {get: () => []};
const outpoint = n => `${n.transaction_id}:${n.transaction_vout}`;
const serviceKey = '024d4b6cd1361032ca9bd2aeb9d900aa4d45d9ead80ac9423374c451a7254d0766';
const sha256 = hex => createHash('sha256').update(Buffer.from(hex, 'hex'));
const signOnly = (res, signingInfo) => ({...res, signing_info: signingInfo});
const sweepAddress = 'bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4';

const utxo = {
  tokens: 200000,
  transaction_id: sha256('01').digest('hex'),
  transaction_vout: 1,
};

const utxos = [
  utxo,
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

// The spends were checked with an independent implementation
const spend = {
  digests: [
    'ba572dd2fd8df04ad2153fa44c65d919026a674c857795b518e9c675e0e00bfb',
    '5bf7858399bd7eb421e066bee6d9151e1307a66ca15fa5b3e800ce3ecbb1a986',
  ],
  id: 'cec93ba74bf2fde3bba65e32148543876e92463c9ca38b8425132e0cb5c26696',
  transaction: '020000000001029a4585773ce2ccd7a585c331d60a60d1e3b7d28cbb2ede3bc55445342f12f54b01000000000000000086d9576498ea764b49243efeb05df625010438c6a55d5b578de4ff00c9b4c1db03000000000000000001a692040000000000160014751e76e8199196d454941c45d1b3a323f1433bd601408afbac27ee385e0eaf8f8eefbe0493952f0f2ffb7cdb726f5dbe628b35ced84bd9400815651486daf4fa3fba691ad11f1a67c5a766b5db3b1e492b7ab76bc614014070bf1de4b04b8bd9c6d4ff3a293a79d7b76a5eb3d5a329e77e540777e640f5f7546d8406369d22f4a25be10806c27574d1b3dd4bffc4aa85f086c2245aecd1db00000000',
};

// A spend of 210000 with change to the address, less a 400 fee for 200 vbytes
const partialSpend = {
  digests: [
    '1083bf21949f65e0506b3cb159cfa03b9d78ab00dcf75446e381d552290633d7',
    '6ba6165d685245001e546fdc83e8958ed51003009229f5016760706f86920cd8',
  ],
  id: 'c12fe2c6d15964ec1c73674473a764303daec4274703f8a7828441ed8cc93414',
  transaction: '020000000001029a4585773ce2ccd7a585c331d60a60d1e3b7d28cbb2ede3bc55445342f12f54b01000000000000000086d9576498ea764b49243efeb05df625010438c6a55d5b578de4ff00c9b4c1db030000000000000000025034030000000000160014751e76e8199196d454941c45d1b3a323f1433bd6005e01000000000022512096b770d763d4c483d3e7fb98381e67a3f1ed4ca4b326327140a890b20bff22a50140f094edb370a87d0a4ffde73f430c3fdea0a5b69debf0c0cdfc4be709755ccc075a8555f20f32eb3f761a594dea4273a55d2074fcffec6a8afceff57fe996666801409641ef5b48030eeb81e2430276768f2b18b83e92ad6b5c76f3298527d0fff7da1a099488c63415e2943c1e343abc442a48667b2a520d6f69501da79c4f4f1a4f00000000',
};

// A spend of 299500 with no change, since a change of 100 would be dust
const dustSpend = {
  digests: [
    '4419e4ef037fbbbf4f98a879cde20e3e12e4a2b8fcd7ec8cf2d5345d6105eae8',
    'f7e29c01329b0f99c68f8d5394352c2b19153c585c4d183078a739cf27bd08e7',
  ],
  id: '2c608aad52c661f548219639dd9ce46270c6b6964311b5b8306cd6570fdfdea8',
  transaction: '020000000001029a4585773ce2ccd7a585c331d60a60d1e3b7d28cbb2ede3bc55445342f12f54b01000000000000000086d9576498ea764b49243efeb05df625010438c6a55d5b578de4ff00c9b4c1db03000000000000000001ec91040000000000160014751e76e8199196d454941c45d1b3a323f1433bd60140b5fdb95df3d4cd8a4d07acd3961552528c9a9be2148d024a820062cef40d4b9698dd189a3868e7defdc8f941745eee637b62815f6554e297bfcea7cefeec4d1e0140bbc8056d5c995d784767fc1673b75be26f8afc110f870b5610cfc6bb71fe7244a7fd5c9824f7714d7895bc3a4aa33e2a9bffd4a7429ab61eb9528a42d054544e00000000',
};

// A fake LND with the client key of the shared address
const clientLnd = args => makeLnd({
  failures: args.failures,
  keys: [{family: 42060, index: 7, secret: clientSecret}],
});

// A fake LND where a signer method fails, after calls that succeed
const failingLnd = (method, after) => clientLnd({
  failures: [{after, method, details: 'err', type: 'signer'}],
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

// A fake LND that combines signatures into a signature that is too short
const shortSignatureLnd = () => {
  const lnd = clientLnd({});

  lnd.signer.muSig2CombineSig = ({}, cbk) => cbk(null, {
    final_signature: Buffer.alloc(32),
    have_all_signatures: true,
  });

  return lnd;
};

// A fake swap service that cosigns every utxo in the spend PSBT
const makeService = ({err, respond}) => {
  const cosigner = sharedAddressCosigner({
    client_public_key: clientKey,
    root_hash: address.root_hash,
  });

  const requests = [];

  return {
    requests,
    serverPsbtWithdrawDeposits: (req, auth, cbk) => {
      if (auth !== metadata) {
        return cbk([400, 'ExpectedAuthenticationMetadataPassedThrough']);
      }

      requests.push(req);

      if (!!err) {
        return cbk(err);
      }

      const psbt = decodePsbt({psbt: bufferAsHex(req.withdrawal_psbt)});

      const transaction = psbt.unsigned_transaction;

      const spends = psbt.inputs.map(input => ({
        script: input.witness_utxo.script_pub,
        tokens: input.witness_utxo.tokens,
      }));

      const {inputs} = componentsOfTransaction({transaction});

      // Every utxo is signed with the nonce of the client for the utxo
      const signingInfo = inputs.reduce((sum, input, vin) => {
        const key = `${input.id}:${input.vout}`;

        const nonce = cosigner.nonceFor(key);

        const {hash} = v1HashToSign({spends, transaction, vin, sighash: 0});

        const sig = cosigner.cosign({
          hash,
          key,
          nonce: bufferAsHex(req.deposit_to_nonces[key]),
        });

        sum[key] = {nonce: hexAsBuffer(nonce), sig: hexAsBuffer(sig)};

        return sum;
      },
      {});

      const {id} = idForTransaction({transaction});

      const res = {signing_info: signingInfo, txid: hexAsBuffer(id).reverse()};

      return cbk(null, !!respond ? respond(res) : res);
    },
  };
};

const makeArgs = overrides => {
  const args = {
    utxos,
    expiry,
    metadata,
    fee_tokens_per_vbyte: 2,
    key_family: 42060,
    key_index: 7,
    lnd: clientLnd({}),
    network: 'btc',
    service: makeService({}),
    service_public_key: serviceKey,
    sweep_address: sweepAddress,
  };

  Object.keys(overrides).forEach(k => args[k] = overrides[k]);

  return args;
};

// A service response where the signature for the first utxo is not valid
const changedSig = res => {
  const key = outpoint(utxo);

  const info = {...res.signing_info[key], sig: Buffer.alloc(32, 1)};

  return signOnly(res, {...res.signing_info, [key]: info});
};

// The spend PSBT has the outputs of the utxos that are spent
const spentOutputs = utxos.map(({tokens}) => {
  return {tokens, script_pub: address.output_script};
});

// The sessions that the client LND started, in the order they were started
const startedSessions = ({calls}) => calls
  .filter(n => n.method === 'muSig2CreateSession' && !!n.response)
  .map(n => n.response);

// The client nonces, spent outputs and transaction id in a service request
const requestOf = ({lnd, req}) => {
  const psbt = decodePsbt({psbt: bufferAsHex(req.withdrawal_psbt)});

  const {id} = idForTransaction({transaction: psbt.unsigned_transaction});

  const sessions = startedSessions(lnd);

  // Nonces are the index of the client session with the nonce
  const nonces = Object.keys(req.deposit_to_nonces).reduce((sum, key) => {
    sum[key] = sessions.findIndex(session => {
      return session.local_public_nonces.equals(req.deposit_to_nonces[key]);
    });

    return sum;
  },
  {});

  return {id, nonces, spends: psbt.inputs.map(input => input.witness_utxo)};
};

// The indexes of the started sessions that the client LND was asked to end
const cleanedSessions = lnd => {
  const sessions = startedSessions(lnd);

  return lnd.calls.filter(n => n.method === 'muSig2Cleanup').map(call => {
    return sessions.findIndex(session => {
      return session.session_id.equals(call.args.session_id);
    });
  });
};

// The hashes that the client LND signed
const signedDigests = ({calls}) => calls
  .filter(n => n.method === 'muSig2Sign')
  .map(n => bufferAsHex(n.args.message_digest));

// The outcome of a spend: the signed spend and the request to the service
const spendFor = ({digests, id, transaction}) => ({
  digests,
  id,
  transaction,
  cleaned: [],
  requests: [{
    id,
    nonces: {[outpoint(utxos[0])]: 0, [outpoint(utxos[1])]: 1},
    spends: spentOutputs,
  }],
});

// Spend the utxos, then see what is signed and which sessions are ended
const spendOf = async args => {
  const {lnd} = args;

  try {
    const res = await spendSharedUtxos(args);

    const requests = args.service.requests.map(req => requestOf({lnd, req}));

    return {
      ...res,
      requests,
      cleaned: cleanedSessions(lnd),
      digests: signedDigests(lnd),
    };
  } catch (err) {
    return {err, cleaned: cleanedSessions(lnd)};
  }
};

const tests = [
  {
    args: makeArgs({utxos: undefined}),
    description: 'Utxos to spend are expected',
    error: [400, 'ExpectedUtxosForSharedUtxosSpend'],
  },
  {
    args: makeArgs({utxos: []}),
    description: 'Utxos to spend are expected to be non-empty',
    error: [400, 'ExpectedUtxosForSharedUtxosSpend'],
  },
  {
    args: makeArgs({utxos: [{...utxo, transaction_id: 'id'}]}),
    description: 'Utxos are expected to have a transaction id',
    error: [400, 'ExpectedValidUtxosForSharedUtxosSpend'],
  },
  {
    args: makeArgs({utxos: [{...utxo, tokens: 0}]}),
    description: 'Utxos are expected to have tokens',
    error: [400, 'ExpectedValidUtxosForSharedUtxosSpend'],
  },
  {
    args: makeArgs({utxos: [{...utxo, transaction_vout: 2 ** 32}]}),
    description: 'Utxo output indexes are expected to be 32 bits',
    error: [400, 'ExpectedValidUtxosForSharedUtxosSpend'],
  },
  {
    args: makeArgs({
      utxos: [
        {...utxo, tokens: 21e14},
        {...utxos[1], tokens: 1},
      ],
    }),
    description: 'Utxos cannot have more than all the tokens there are',
    error: [400, 'ExpectedValidUtxosForSharedUtxosSpend'],
  },
  {
    args: makeArgs({
      utxos: [
        utxo,
        {...utxo, transaction_id: utxo.transaction_id.toUpperCase()},
      ],
    }),
    description: 'A utxo can only be spent once',
    error: [400, 'UnexpectedDuplicateUtxoInSharedUtxosSpend'],
  },
  {
    args: makeArgs({expiry: undefined}),
    description: 'A shared address expiry is expected',
    error: [400, 'ExpectedExpiryForSharedUtxosSpend'],
  },
  {
    args: makeArgs({fee_tokens_per_vbyte: undefined}),
    description: 'A fee rate is expected',
    error: [400, 'ExpectedFeeRateForSharedUtxosSpend'],
  },
  {
    args: makeArgs({key_family: undefined}),
    description: 'A key family is expected',
    error: [400, 'ExpectedKeyFamilyForSharedUtxosSpend'],
  },
  {
    args: makeArgs({key_index: undefined}),
    description: 'A key index is expected',
    error: [400, 'ExpectedKeyIndexForSharedUtxosSpend'],
  },
  {
    args: makeArgs({lnd: undefined}),
    description: 'An LND object is expected',
    error: [400, 'ExpectedAuthenticatedLndForSharedUtxosSpend'],
  },
  {
    args: makeArgs({metadata: undefined}),
    description: 'Authentication metadata is expected',
    error: [400, 'ExpectedAuthMetadataForSharedUtxosSpend'],
  },
  {
    args: makeArgs({network: undefined}),
    description: 'A known network is expected',
    error: [400, 'ExpectedKnownNetworkForSharedUtxosSpend'],
  },
  {
    args: makeArgs({service: {}}),
    description: 'A swap service is expected',
    error: [400, 'ExpectedServiceForSharedUtxosSpend'],
  },
  {
    args: makeArgs({service_public_key: undefined}),
    description: 'A shared address service key is expected',
    error: [400, 'ExpectedServiceKeyForSharedUtxosSpend'],
  },
  {
    args: makeArgs({sweep_address: undefined}),
    description: 'An address to spend to is expected',
    error: [400, 'ExpectedSweepAddressForSharedUtxosSpend'],
  },
  {
    args: makeArgs({tokens: 1.5}),
    description: 'Tokens to spend are expected to be a whole number',
    error: [400, 'ExpectedValidTokensForSharedUtxosSpend'],
  },
  {
    args: makeArgs({network: 'btctestnet'}),
    description: 'The address to spend to has to be for the network',
    error: [400, 'ExpectedValidSweepAddressForSharedUtxosSpend'],
  },
  {
    args: makeArgs({service_public_key: Buffer.alloc(33, 3).toString('hex')}),
    description: 'A valid shared address service key is expected',
    error: [
      400,
      'FailedToDeriveSharedAddressToSpend',
      {err: new Error('ExpectedValidServerPublicKeyForSharedAddressScript')},
    ],
  },
  {
    args: makeArgs({tokens: 299800}),
    description: 'Utxos are expected to pay for the spend fee',
    error: [400, 'ExpectedMoreUtxosToPayForSharedUtxosSpend'],
  },
  {
    args: makeArgs({utxos: [{...utxo, tokens: 700}]}),
    description: 'A spend cannot be dust',
    error: [400, 'ExpectedMoreTokensToSpendSharedUtxos', {fee: 198}],
  },
  {
    args: makeArgs({tokens: 100000}),
    description: 'A utxo that is less than the change is not needed',
    error: [400, 'UnexpectedUnneededUtxoInSharedUtxosSpend'],
  },
  {
    args: makeArgs({lnd: otherKeyLnd()}),
    description: 'A session key that is not the shared address is rejected',
    error: [503, 'UnexpectedSessionKeyForSharedAddress'],
  },
  {
    args: makeArgs({service: makeService({err: 'err'})}),
    description: 'An error from the swap service is passed back',
    error: [503, 'UnexpectedErrorSpendingSharedUtxos', {err: 'err'}],
  },
  {
    args: makeArgs({service: makeService({respond: () => null})}),
    description: 'A response from the swap service is expected',
    error: [503, 'ExpectedResponseToSharedUtxosSpendRequest'],
  },
  {
    args: makeArgs({
      service: makeService({respond: res => ({...res, txid: undefined})}),
    }),
    description: 'A transaction id from the swap service is expected',
    error: [503, 'ExpectedResponseToSharedUtxosSpendRequest'],
  },
  {
    args: makeArgs({
      service: makeService({
        respond: res => ({...res, signing_info: undefined}),
      }),
    }),
    description: 'Signatures from the swap service are expected',
    error: [503, 'ExpectedResponseToSharedUtxosSpendRequest'],
  },
  {
    args: makeArgs({
      service: makeService({
        respond: res => ({...res, txid: Buffer.alloc(32)}),
      }),
    }),
    description: 'The swap service is expected to sign the spend',
    error: [503, 'UnexpectedTxIdInSharedUtxosSpendResponse'],
  },
  {
    args: makeArgs({
      service: makeService({
        respond: res => signOnly(res, {
          [outpoint(utxo)]: res.signing_info[outpoint(utxo)],
        }),
      }),
    }),
    description: 'The swap service is expected to sign every utxo',
    error: [503, 'ExpectedSigningInfoForEverySpentUtxo'],
  },
  {
    args: makeArgs({
      service: makeService({
        respond: res => signOnly(res, {
          [outpoint(utxo)]: res.signing_info[outpoint(utxo)],
          unknown: res.signing_info[outpoint(utxo)],
        }),
      }),
    }),
    description: 'The swap service is expected to sign the spent utxos',
    error: [503, 'ExpectedSigningInfoForEverySpentUtxo'],
  },
  {
    args: makeArgs({
      service: makeService({
        respond: res => signOnly(res, {
          ...res.signing_info,
          [outpoint(utxo)]: badInfo,
        }),
      }),
    }),
    description: 'The swap service is expected to send a nonce and signature',
    error: [503, 'ExpectedValidSigningInfoForSpentUtxo'],
  },
  {
    args: makeArgs({
      service: makeService({
        respond: res => signOnly(res, {
          ...res.signing_info,
          [outpoint(utxo)]: badSig,
        }),
      }),
    }),
    description: 'The swap service is expected to send a valid signature',
    error: [503, 'ExpectedValidSigningInfoForSpentUtxo'],
  },
  {
    args: makeArgs({lnd: shortSignatureLnd()}),
    description: 'A combined signature is expected for every utxo',
    error: [503, 'ExpectedSignatureForSpentUtxo'],
  },
  {
    args: makeArgs({lnd: failingLnd('muSig2CombineSig')}),
    description: 'An error combining signatures is passed back',
    error: [
      503,
      'UnexpectedErrorFinishingMuSig2Session',
      {err: makeRpcError({details: 'err'})},
    ],
  },
  {
    args: makeArgs({
      service: makeService({respond: res => changedSig(res)}),
    }),
    description: 'A service signature that is not valid is not combined',
    error: [
      503,
      'UnexpectedErrorFinishingMuSig2Session',
      {err: makeRpcError({details: invalidSignature})},
    ],
  },
  {
    args: makeArgs({tokens: 299800}),
    description: 'There are no sessions to end when validation fails',
    expected: {
      cleaned: [],
      err: [400, 'ExpectedMoreUtxosToPayForSharedUtxosSpend'],
    },
  },
  {
    args: makeArgs({lnd: otherKeyLnd()}),
    description: 'A session with an unexpected key is ended',
    expected: {
      cleaned: [0],
      err: [503, 'UnexpectedSessionKeyForSharedAddress'],
    },
  },
  {
    args: makeArgs({service: makeService({respond: () => null})}),
    description: 'Sessions are ended when the service response is invalid',
    expected: {
      cleaned: [0, 1],
      err: [503, 'ExpectedResponseToSharedUtxosSpendRequest'],
    },
  },
  {
    args: makeArgs({lnd: failingLnd('muSig2CombineSig')}),
    description: 'Sessions are ended when combining signatures fails',
    expected: {
      cleaned: [0, 1],
      err: [
        503,
        'UnexpectedErrorFinishingMuSig2Session',
        {err: makeRpcError({details: 'err'})},
      ],
    },
  },
  {
    args: makeArgs({lnd: shortSignatureLnd()}),
    description: 'A session with combined signatures is not ended again',
    expected: {
      cleaned: [1],
      err: [503, 'ExpectedSignatureForSpentUtxo'],
    },
  },
  {
    args: makeArgs({service: makeService({err: 'err'})}),
    description: 'Signing sessions are cleaned up when a spend fails',
    expected: {
      cleaned: [0, 1],
      err: [503, 'UnexpectedErrorSpendingSharedUtxos', {err: 'err'}],
    },
  },
  {
    args: makeArgs({lnd: failingLnd('muSig2CreateSession', 1)}),
    description: 'Sessions are cleaned up when a session cannot be made',
    expected: {
      cleaned: [0],
      err: [
        503,
        'UnexpectedErrorCreatingMuSig2Session',
        {err: makeRpcError({details: 'err'})},
      ],
    },
  },
  {
    args: makeArgs({lnd: failingLnd('muSig2Sign')}),
    description: 'Sessions are cleaned up when signing fails',
    expected: {
      cleaned: [0, 1],
      err: [
        503,
        'UnexpectedErrorSigningMuSig2Session',
        {err: makeRpcError({details: 'err'})},
      ],
    },
  },
  {
    args: makeArgs({
      lnd: failingLnd('muSig2Cleanup'),
      service: makeService({err: 'err'}),
    }),
    description: 'A failure to end a session is not an error',
    expected: {
      cleaned: [0, 1],
      err: [503, 'UnexpectedErrorSpendingSharedUtxos', {err: 'err'}],
    },
  },
  {
    args: makeArgs({}),
    description: 'Spend shared address utxos',
    expected: spendFor(spend),
  },
  {
    args: makeArgs({tokens: 210000}),
    description: 'Spend some tokens with change back to the address',
    expected: spendFor(partialSpend),
  },
  {
    args: makeArgs({tokens: 299500}),
    description: 'Change that would be dust is given to miners',
    expected: spendFor(dustSpend),
  },
];

tests.forEach(({args, description, error, expected}) => {
  return test(description, async () => {
    if (!!error) {
      await rejects(spendSharedUtxos(args), error, 'Got error');
    } else {
      deepEqual(await spendOf(args), expected, 'Got spend');
    }

    return;
  });
});

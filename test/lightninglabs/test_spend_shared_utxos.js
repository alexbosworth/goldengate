const {createHash} = require('node:crypto');
const {deepEqual} = require('node:assert').strict;
const {rejects} = require('node:assert').strict;
const test = require('node:test');

const {decodePsbt} = require('psbt');
const {idForTransaction} = require('@alexbosworth/blockchain');

const {sharedAddressScript} = require('./../../');
const {spendSharedUtxos} = require('./../../');

const badInfo = {nonce: Buffer.alloc(65), sig: Buffer.alloc(32)};
const badSig = {nonce: Buffer.alloc(66), sig: Buffer.alloc(31)};
const bufferAsHex = buffer => Buffer.from(buffer).toString('hex');
const clientKey = '031b84c5567b126440995d3ed5aaba0565d71e1834604819ff9c17f5e9d5dd078f';
const expiry = 14400;
const hexAsBuffer = hex => Buffer.from(hex, 'hex');
const metadata = {get: () => []};
const outpoint = n => `${n.transaction_id}:${n.transaction_vout}`;
const serviceKey = '024d4b6cd1361032ca9bd2aeb9d900aa4d45d9ead80ac9423374c451a7254d0766';
const sessionId = n => Buffer.alloc(32, n).toString('hex');
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
  transaction: '020000000001029a4585773ce2ccd7a585c331d60a60d1e3b7d28cbb2ede3bc55445342f12f54b01000000000000000086d9576498ea764b49243efeb05df625010438c6a55d5b578de4ff00c9b4c1db03000000000000000001a692040000000000160014751e76e8199196d454941c45d1b3a323f1433bd601407dcaac803dd8345221d8c675fdcdcb2510bfc08d3f312d8a603c371149168bc143995242f11cf473c3c02dfd43a9af02b9e6f7b42f3429be52dc6508eaccedf2014079753f114a49d41d1d63f55991925a0868dd468a59ffd7f7c149b4107f6e2e57bd706ed14485e080f660ca1bc9865cfb7abcc56b9d16e961a526083d942d6a1400000000',
};

// A spend of 210000 with change to the address, less a 400 fee for 200 vbytes
const partialSpend = {
  digests: [
    '1083bf21949f65e0506b3cb159cfa03b9d78ab00dcf75446e381d552290633d7',
    '6ba6165d685245001e546fdc83e8958ed51003009229f5016760706f86920cd8',
  ],
  id: 'c12fe2c6d15964ec1c73674473a764303daec4274703f8a7828441ed8cc93414',
  transaction: '020000000001029a4585773ce2ccd7a585c331d60a60d1e3b7d28cbb2ede3bc55445342f12f54b01000000000000000086d9576498ea764b49243efeb05df625010438c6a55d5b578de4ff00c9b4c1db030000000000000000025034030000000000160014751e76e8199196d454941c45d1b3a323f1433bd6005e01000000000022512096b770d763d4c483d3e7fb98381e67a3f1ed4ca4b326327140a890b20bff22a501407dcaac803dd8345221d8c675fdcdcb2510bfc08d3f312d8a603c371149168bc143995242f11cf473c3c02dfd43a9af02b9e6f7b42f3429be52dc6508eaccedf2014079753f114a49d41d1d63f55991925a0868dd468a59ffd7f7c149b4107f6e2e57bd706ed14485e080f660ca1bc9865cfb7abcc56b9d16e961a526083d942d6a1400000000',
};

// A spend of 299500 with no change, since a change of 100 would be dust
const dustSpend = {
  digests: [
    '4419e4ef037fbbbf4f98a879cde20e3e12e4a2b8fcd7ec8cf2d5345d6105eae8',
    'f7e29c01329b0f99c68f8d5394352c2b19153c585c4d183078a739cf27bd08e7',
  ],
  id: '2c608aad52c661f548219639dd9ce46270c6b6964311b5b8306cd6570fdfdea8',
  transaction: '020000000001029a4585773ce2ccd7a585c331d60a60d1e3b7d28cbb2ede3bc55445342f12f54b01000000000000000086d9576498ea764b49243efeb05df625010438c6a55d5b578de4ff00c9b4c1db03000000000000000001ec91040000000000160014751e76e8199196d454941c45d1b3a323f1433bd601407dcaac803dd8345221d8c675fdcdcb2510bfc08d3f312d8a603c371149168bc143995242f11cf473c3c02dfd43a9af02b9e6f7b42f3429be52dc6508eaccedf2014079753f114a49d41d1d63f55991925a0868dd468a59ffd7f7c149b4107f6e2e57bd706ed14485e080f660ca1bc9865cfb7abcc56b9d16e961a526083d942d6a1400000000',
};

// A fake LND signer: combined signatures commit to the service signature
const makeLnd = ({cleanupErr, combine, failAt, sessionKey, sign}) => {
  const cleaned = [];
  const digests = [];
  const registered = {};
  const state = {sessions: 0};

  return {
    cleaned,
    digests,
    signer: {
      muSig2Cleanup: ({session_id}, cbk) => {
        cleaned.push(bufferAsHex(session_id));

        return cbk(cleanupErr);
      },
      muSig2CombineSig: (args, cbk) => {
        if (!!combine) {
          return combine(args, cbk);
        }

        const id = bufferAsHex(args.session_id);
        const [sig] = args.other_partial_signatures.map(bufferAsHex);

        const parts = [`${id}${sig}`, sig].map(n => sha256(n).digest());

        return cbk(null, {
          final_signature: Buffer.concat(parts),
          have_all_signatures: true,
        });
      },
      muSig2CreateSession: (args, cbk) => {
        const keys = args.all_signer_pubkeys.map(bufferAsHex);

        if (keys.join() !== [clientKey, serviceKey].join()) {
          return cbk([400, 'ExpectedClientAndServiceKeysForSession']);
        }

        if (args.key_loc.key_family !== 42060) {
          return cbk([400, 'ExpectedSharedAddressKeyFamily']);
        }

        if (args.key_loc.key_index !== 7) {
          return cbk([400, 'ExpectedSharedAddressKeyIndex']);
        }

        const root = bufferAsHex(args.taproot_tweak.script_root);

        if (root !== address.root_hash) {
          return cbk([400, 'ExpectedSharedAddressScriptRootTweak']);
        }

        if (args.version !== 'MUSIG2_VERSION_V100RC2') {
          return cbk([400, 'ExpectedMuSig2Version1RC2']);
        }

        state.sessions++;

        if (state.sessions === failAt) {
          return cbk('err');
        }

        const combinedKey = sessionKey || address.output_script.slice(4);

        return cbk(null, {
          combined_key: hexAsBuffer(combinedKey),
          local_public_nonces: Buffer.alloc(66, state.sessions),
          session_id: Buffer.alloc(32, state.sessions),
          taproot_internal_key: hexAsBuffer(address.internal_key),
        });
      },
      muSig2RegisterNonces: (args, cbk) => {
        const [nonce] = args.other_signer_public_nonces;

        registered[bufferAsHex(args.session_id)] = bufferAsHex(nonce);

        return cbk(null, {have_all_nonces: true});
      },
      muSig2Sign: (args, cbk) => {
        const digest = bufferAsHex(args.message_digest);
        const nonce = registered[bufferAsHex(args.session_id)];

        digests.push(digest);

        if (!!sign) {
          return sign(args, cbk);
        }

        return cbk(null, {
          local_partial_signature: sha256(`${digest}${nonce}`).digest(),
        });
      },
    },
    wallet: {
      deriveKey: ({}, cbk) => cbk(null, {
        key_loc: {key_index: 7},
        raw_key_bytes: hexAsBuffer(clientKey),
      }),
    },
  };
};

// A fake swap service that signs every utxo in the spend PSBT
const makeService = ({err, respond}) => {
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

      const {id} = idForTransaction({transaction: psbt.unsigned_transaction});

      const signed = Object.keys(req.deposit_to_nonces).sort();

      const signingInfo = {};

      signed.forEach((key, i) => {
        signingInfo[key] = {
          nonce: Buffer.alloc(66, 20 + i),
          sig: Buffer.alloc(32, 30 + i),
        };
      });

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
    lnd: makeLnd({}),
    network: 'btc',
    service: makeService({}),
    service_public_key: serviceKey,
    sweep_address: sweepAddress,
  };

  Object.keys(overrides).forEach(k => args[k] = overrides[k]);

  return args;
};

// Client nonces are keyed by the outpoints of the utxos
const clientNonces = utxos.reduce((sum, n, i) => {
  sum[outpoint(n)] = Buffer.alloc(66, i + 1);

  return sum;
},
{});

// The spend PSBT has the outputs of the utxos that are spent
const spentOutputs = utxos.map(({tokens}) => {
  return {tokens, script_pub: address.output_script};
});

// The client nonces, spent outputs and transaction id in a service request
const requestOf = req => {
  const psbt = decodePsbt({psbt: bufferAsHex(req.withdrawal_psbt)});

  const {id} = idForTransaction({transaction: psbt.unsigned_transaction});

  return {
    id,
    nonces: req.deposit_to_nonces,
    spends: psbt.inputs.map(input => input.witness_utxo),
  };
};

// The outcome of a spend: the signed spend and the request to the service
const spendFor = ({digests, id, transaction}) => ({
  digests,
  id,
  transaction,
  cleaned: [],
  requests: [{id, nonces: clientNonces, spends: spentOutputs}],
});

// Spend the utxos, then see what is signed and which sessions are ended
const spendOf = async args => {
  const {cleaned, digests} = args.lnd;

  try {
    const res = await spendSharedUtxos(args);

    const requests = args.service.requests.map(requestOf);

    return {...res, cleaned, digests, requests};
  } catch (err) {
    return {cleaned, err};
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
    args: makeArgs({lnd: makeLnd({sessionKey: address.internal_key})}),
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
    args: makeArgs({
      lnd: makeLnd({
        combine: ({}, cbk) => cbk(null, {
          final_signature: Buffer.alloc(32),
          have_all_signatures: true,
        }),
      }),
    }),
    description: 'A combined signature is expected for every utxo',
    error: [503, 'ExpectedSignatureForSpentUtxo'],
  },
  {
    args: makeArgs({lnd: makeLnd({combine: ({}, cbk) => cbk('err')})}),
    description: 'An error combining signatures is passed back',
    error: [503, 'UnexpectedErrorFinishingMuSig2Session', {err: 'err'}],
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
    args: makeArgs({lnd: makeLnd({sessionKey: address.internal_key})}),
    description: 'A session with an unexpected key is ended',
    expected: {
      cleaned: [sessionId(1)],
      err: [503, 'UnexpectedSessionKeyForSharedAddress'],
    },
  },
  {
    args: makeArgs({service: makeService({respond: () => null})}),
    description: 'Sessions are ended when the service response is invalid',
    expected: {
      cleaned: [1, 2].map(sessionId),
      err: [503, 'ExpectedResponseToSharedUtxosSpendRequest'],
    },
  },
  {
    args: makeArgs({lnd: makeLnd({combine: ({}, cbk) => cbk('err')})}),
    description: 'Sessions are ended when combining signatures fails',
    expected: {
      cleaned: [1, 2].map(sessionId),
      err: [503, 'UnexpectedErrorFinishingMuSig2Session', {err: 'err'}],
    },
  },
  {
    args: makeArgs({
      lnd: makeLnd({
        combine: ({}, cbk) => cbk(null, {
          final_signature: Buffer.alloc(32),
          have_all_signatures: true,
        }),
      }),
    }),
    description: 'A session with combined signatures is not ended again',
    expected: {
      cleaned: [sessionId(2)],
      err: [503, 'ExpectedSignatureForSpentUtxo'],
    },
  },
  {
    args: makeArgs({service: makeService({err: 'err'})}),
    description: 'Signing sessions are cleaned up when a spend fails',
    expected: {
      cleaned: [1, 2].map(sessionId),
      err: [503, 'UnexpectedErrorSpendingSharedUtxos', {err: 'err'}],
    },
  },
  {
    args: makeArgs({lnd: makeLnd({failAt: 2})}),
    description: 'Sessions are cleaned up when a session cannot be made',
    expected: {
      cleaned: [sessionId(1)],
      err: [503, 'UnexpectedErrorCreatingMuSig2Session', {err: 'err'}],
    },
  },
  {
    args: makeArgs({lnd: makeLnd({sign: ({}, cbk) => cbk('err')})}),
    description: 'Sessions are cleaned up when signing fails',
    expected: {
      cleaned: [1, 2].map(sessionId),
      err: [503, 'UnexpectedErrorSigningMuSig2Session', {err: 'err'}],
    },
  },
  {
    args: makeArgs({
      lnd: makeLnd({cleanupErr: 'err'}),
      service: makeService({err: 'err'}),
    }),
    description: 'A failure to end a session is not an error',
    expected: {
      cleaned: [1, 2].map(sessionId),
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

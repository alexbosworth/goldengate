const {createHash} = require('node:crypto');
const {deepEqual} = require('node:assert').strict;
const {rejects} = require('node:assert').strict;
const test = require('node:test');

const {createPsbt} = require('psbt');
const {decodePsbt} = require('psbt');
const {idForTransaction} = require('@alexbosworth/blockchain');
const {numberAsCompactInt} = require('@alexbosworth/blockchain');
const {v1HashToSign} = require('p2tr');

const {encodeTransaction} = require('./../../transactions');
const {sharedAddressScript} = require('./../../');
const {signSwapInCoopSettlement} = require('./../../');

const clientKey = '031b84c5567b126440995d3ed5aaba0565d71e1834604819ff9c17f5e9d5dd078f';
const expiry = 14400;
const id = Buffer.alloc(32, 9).toString('hex');
const metadata = {get: () => []};
const otherId = Buffer.alloc(32, 8).toString('hex');
const outpoint = n => `${n.transaction_id}:${n.transaction_vout}`;
const psbtError = 'ExpectedHexSerializedPartiallySignedBitcoinTransaction';
const serverScript = `0014${Buffer.alloc(20, 4).toString('hex')}`;
const serviceKey = '024d4b6cd1361032ca9bd2aeb9d900aa4d45d9ead80ac9423374c451a7254d0766';
const serviceNonce = vin => Buffer.alloc(66, 16 + vin).toString('hex');
const sha256 = hex => createHash('sha256').update(Buffer.from(hex, 'hex'));
const upper = n => ({...n, transaction_id: n.transaction_id.toUpperCase()});

const address = sharedAddressScript({
  expiry,
  client_public_key: clientKey,
  network: 'btc',
  server_public_key: serviceKey,
});

const outputKey = address.output_script.slice(4);

const utxos = [
  {tokens: 200000, transaction_id: sha256('01').digest('hex'), vout: 1},
  {tokens: 100000, transaction_id: sha256('02').digest('hex'), vout: 3},
].map(utxo => ({
  tokens: utxo.tokens,
  transaction_id: utxo.transaction_id,
  transaction_vout: utxo.vout,
}));

const foreign = {
  script: serverScript,
  tokens: 500000,
  transaction_id: sha256('03').digest('hex'),
  transaction_vout: 0,
};

// Make a sweep PSBT that spends the utxos along with a foreign input
const makeSweep = ({change, changeScript, extra}) => {
  const asUtxo = n => ({id: n.transaction_id, vout: n.transaction_vout});

  const spends = utxos.map(n => ({...n, script: address.output_script}))
    .concat(foreign)
    .concat(extra || []);

  const outputs = [{script: serverScript, tokens: 700000}];

  if (!!change) {
    const script = changeScript || address.output_script;

    outputs.push({script, tokens: change});
  }

  const {psbt} = createPsbt({
    outputs,
    utxos: spends.map(asUtxo),
  });

  return {psbt, spends};
};

// Make a PSBT with a sweep transaction that spends a utxo twice
const makeDoubleSpendPsbt = () => {
  const [utxo] = utxos;

  const {transaction} = encodeTransaction({
    inputs: [utxo, utxo].map(spent => ({
      id: spent.transaction_id,
      script: '',
      sequence: 0,
      vout: spent.transaction_vout,
    })),
    locktime: 0,
    outputs: [{script: serverScript, tokens: 1}],
    version: 2,
  });

  const tx = Buffer.from(transaction, 'hex');

  // The PSBT has the transaction, then empty maps for the inputs and output
  return Buffer.concat([
    Buffer.from('70736274ff', 'hex'),
    Buffer.from([1, 0]),
    numberAsCompactInt({number: tx.length}).encoded,
    tx,
    Buffer.alloc(1 + 2 + 1),
  ])
  .toString('hex');
};

// The swap payment request as LND looks it up
const invoiceAs = ({hash, state}) => ({
  state,
  amt_paid_msat: '0',
  amt_paid_sat: '0',
  cltv_expiry: '40',
  creation_date: '1',
  description_hash: Buffer.alloc(0),
  expiry: '3600',
  features: {},
  htlcs: [],
  memo: '',
  payment_addr: Buffer.alloc(32),
  payment_request: 'request',
  private: false,
  r_hash: hash,
  r_preimage: Buffer.alloc(32),
  settle_date: '0',
  value: '251000',
  value_msat: '251000000',
});

// A fake LND with the swap invoice and a signer committing to digest and nonce
const makeLnd = ({isUnpaid, lookupErr, sessionKey}) => {
  const registered = {};
  const state = {sessions: 0};

  return {
    default: {
      lookupInvoice: ({r_hash}, cbk) => {
        if (!!lookupErr) {
          return cbk(lookupErr);
        }

        const status = !!isUnpaid ? 'OPEN' : 'SETTLED';

        return cbk(null, invoiceAs({hash: r_hash, state: status}));
      },
    },
    signer: {
      muSig2Cleanup: ({}, cbk) => cbk(),
      muSig2CombineSig: ({}, cbk) => cbk([500, 'UnexpectedCombineSigRequest']),
      muSig2CreateSession: (args, cbk) => {
        const root = args.taproot_tweak.script_root.toString('hex');

        if (root !== address.root_hash) {
          return cbk([400, 'ExpectedSharedAddressScriptRootTweak']);
        }

        state.sessions++;

        return cbk(null, {
          combined_key: Buffer.from(sessionKey, 'hex'),
          local_public_nonces: Buffer.alloc(66, state.sessions),
          session_id: Buffer.alloc(32, state.sessions),
          taproot_internal_key: Buffer.from(address.internal_key, 'hex'),
        });
      },
      muSig2RegisterNonces: (args, cbk) => {
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

const sweep = makeSweep({change: 49000});

const swap = {utxos, id, tokens: 251000};

// The service nonces for the swap utxos
const nonces = utxos.map((utxo, vin) => ({
  nonce: serviceNonce(vin),
  transaction_id: utxo.transaction_id,
  transaction_vout: utxo.transaction_vout,
}));

// Another swap that is batched in a sweep with the swap
const other = {
  tokens: 80000,
  transaction_id: sha256('05').digest('hex'),
  transaction_vout: 2,
};

const otherSwap = {utxos: [other], id: otherId, tokens: 50000};

const extra = {...other, script: address.output_script};

// A batched sweep with the change of both swaps
const full = makeSweep({extra, change: 79000});

// A batched sweep with only the change of the first swap
const short = makeSweep({extra, change: 49000});

// A sweep of all of the swap utxos
const noChange = makeSweep({});

// A fake LND where the payment lookup is slow and signing is not expected
const makeUnpaidLnd = () => {
  const lnd = makeLnd({isUnpaid: true, sessionKey: outputKey});

  const {lookupInvoice} = lnd.default;

  // A slow payment lookup gives signing time to start if it does not wait
  lnd.default.lookupInvoice = (args, cbk) => {
    return setTimeout(() => lookupInvoice(args, cbk), 50);
  };

  lnd.signer.muSig2CreateSession = ({}, cbk) => {
    return cbk([500, 'UnexpectedSigningSessionForUnpaidSwap']);
  };

  return lnd;
};

// A fake service that keeps the pushes of sweep signatures
const makeService = () => {
  const pushes = [];

  return {
    pushes,
    pushStaticAddressSweeplessSigs: (args, auth, cbk) => {
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
    expiry,
    id,
    metadata,
    nonces,
    key_family: 42060,
    key_index: 7,
    lnd: makeLnd({sessionKey: outputKey}),
    network: 'btc',
    prevouts: sweep.spends,
    psbt: sweep.psbt,
    service: makeService(),
    service_public_key: serviceKey,
    swaps: [swap],
  };

  Object.keys(overrides).forEach(k => args[k] = overrides[k]);

  return args;
};

// Get the expected push of signatures for a sweep
const expectedPush = ({psbt, signing, spends}) => {
  const transaction = decodePsbt({psbt}).unsigned_transaction;

  const signingInfo = signing.reduce((sum, utxo, i) => {
    const vin = spends.findIndex(n => outpoint(n) === outpoint(utxo));

    const {hash} = v1HashToSign({spends, transaction, vin, sighash: 0});

    sum[outpoint(utxo)] = {
      nonce: Buffer.alloc(66, i + 1),
      sig: sha256(`${hash}${utxo.nonce}`).digest(),
    };

    return sum;
  },
  {});

  const txId = idForTransaction({transaction}).id;

  return {
    signing_info: signingInfo,
    swap_hash: Buffer.from(id, 'hex'),
    txid: Buffer.from(txId, 'hex').reverse(),
  };
};

// The sweep transaction id and the signatures pushed for the sweep
const settlementFor = ({psbt, signing, spends}) => {
  const transaction = decodePsbt({psbt}).unsigned_transaction;

  return {
    pushes: [expectedPush({psbt, signing, spends})],
    transaction_id: idForTransaction({transaction}).id,
  };
};

// Cosign a sweep and get the signatures that are pushed to the service
const settlementOf = async args => {
  const res = await signSwapInCoopSettlement(args);

  return {...res, pushes: args.service.pushes};
};

const tests = [
  {
    args: makeArgs({expiry: undefined}),
    description: 'A shared address expiry is expected',
    error: [400, 'ExpectedSharedAddressExpiryToSignSettlement'],
  },
  {
    args: makeArgs({id: undefined}),
    description: 'A swap hash is expected',
    error: [400, 'ExpectedSwapHashToSignSettlement'],
  },
  {
    args: makeArgs({key_family: undefined}),
    description: 'A key family is expected',
    error: [400, 'ExpectedKeyFamilyToSignSettlement'],
  },
  {
    args: makeArgs({key_index: undefined}),
    description: 'A key index is expected',
    error: [400, 'ExpectedKeyIndexToSignSettlement'],
  },
  {
    args: makeArgs({lnd: undefined}),
    description: 'An LND object is expected',
    error: [400, 'ExpectedAuthenticatedLndToSignSettlement'],
  },
  {
    args: makeArgs({metadata: undefined}),
    description: 'Authentication metadata is expected',
    error: [400, 'ExpectedAuthMetadataToSignSettlement'],
  },
  {
    args: makeArgs({network: undefined}),
    description: 'A network name is expected',
    error: [400, 'ExpectedNetworkNameToSignSettlement'],
  },
  {
    args: makeArgs({nonces: []}),
    description: 'Service nonces are expected',
    error: [400, 'ExpectedServiceNoncesToSignSettlement'],
  },
  {
    args: makeArgs({nonces: [{...makeArgs({}).nonces[0], nonce: '00'}]}),
    description: 'Valid service nonces are expected',
    error: [400, 'ExpectedValidNoncesToSignSettlement'],
  },
  {
    args: makeArgs({nonces: [{...nonces[0], transaction_id: 'id'}]}),
    description: 'Service nonces are expected to be for a transaction',
    error: [400, 'ExpectedValidNoncesToSignSettlement'],
  },
  {
    args: makeArgs({nonces: [{...nonces[0], transaction_vout: -1}]}),
    description: 'Service nonces are expected to be for an output',
    error: [400, 'ExpectedValidNoncesToSignSettlement'],
  },
  {
    args: makeArgs({prevouts: [{...sweep.spends[0], tokens: -1}]}),
    description: 'Valid prevouts are expected',
    error: [400, 'ExpectedPrevoutsToSignSettlement'],
  },
  {
    args: makeArgs({prevouts: [{...sweep.spends[0], script: 'zz'}]}),
    description: 'Prevouts are expected to have output scripts',
    error: [400, 'ExpectedPrevoutsToSignSettlement'],
  },
  {
    args: makeArgs({psbt: undefined}),
    description: 'A sweep PSBT is expected',
    error: [400, 'ExpectedPsbtToSignSettlement'],
  },
  {
    args: makeArgs({service: {}}),
    description: 'A service to push signatures to is expected',
    error: [400, 'ExpectedServiceToSignSettlement'],
  },
  {
    args: makeArgs({service_public_key: undefined}),
    description: 'A shared address service key is expected',
    error: [400, 'ExpectedServiceKeyToSignSettlement'],
  },
  {
    args: makeArgs({service_public_key: Buffer.alloc(33).toString('hex')}),
    description: 'A valid shared address service key is expected',
    error: [
      400,
      'FailedToDeriveSharedAddressToSignSettlement',
      {err: new Error('ExpectedValidServerPublicKeyForSharedAddressScript')},
    ],
  },
  {
    args: makeArgs({swaps: undefined}),
    description: 'Swaps are expected',
    error: [400, 'ExpectedSwapsToSignSettlement'],
  },
  {
    args: makeArgs({swaps: [{utxos, id, tokens: 300001}]}),
    description: 'Valid swaps are expected',
    error: [400, 'ExpectedValidSwapsToSignSettlement'],
  },
  {
    args: makeArgs({swaps: [{id, tokens: 1, utxos: [{tokens: 1}]}]}),
    description: 'Swap utxos are expected to have outpoints',
    error: [400, 'ExpectedValidSwapsToSignSettlement'],
  },
  {
    args: makeArgs({swaps: [{utxos, id: 'id', tokens: 251000}]}),
    description: 'Swaps are expected to have a swap hash',
    error: [400, 'ExpectedValidSwapsToSignSettlement'],
  },
  {
    args: makeArgs({swaps: [{utxos, id, tokens: 0}]}),
    description: 'Swaps are expected to have tokens',
    error: [400, 'ExpectedValidSwapsToSignSettlement'],
  },
  {
    args: makeArgs({swaps: [{utxos, id: otherId, tokens: 251000}]}),
    description: 'The swap of the sweep is expected',
    error: [400, 'ExpectedSwapForCoopSettlement'],
  },
  {
    args: makeArgs({lnd: makeLnd({lookupErr: 'err', sessionKey: outputKey})}),
    description: 'An error looking up the swap payment is passed back',
    error: [503, 'UnexpectedLookupInvoiceErr', {err: 'err'}],
  },
  {
    args: makeArgs({lnd: makeLnd({isUnpaid: true, sessionKey: outputKey})}),
    description: 'The swap is expected to be paid before cosigning',
    error: [425, 'ExpectedPaidSwapToSignSettlement'],
  },
  {
    args: makeArgs({psbt: 'psbt'}),
    description: 'A valid PSBT is expected',
    error: [
      400,
      'ExpectedValidPsbtToSignSettlement',
      {err: new Error(psbtError)},
    ],
  },
  {
    args: makeArgs({prevouts: sweep.spends.slice(1)}),
    description: 'A prevout is expected for every input',
    error: [400, 'ExpectedPrevoutForEveryInputInCoopSettlement'],
  },
  {
    args: makeArgs({
      prevouts: sweep.spends.slice(1).concat({
        ...foreign,
        transaction_vout: 9,
      }),
    }),
    description: 'Prevouts are expected to be for the inputs',
    error: [400, 'ExpectedPrevoutForEveryInputInCoopSettlement'],
  },
  {
    args: makeArgs({
      prevouts: sweep.spends.concat({...foreign, transaction_vout: 9}),
    }),
    description: 'Prevouts are expected to be only for the inputs',
    error: [400, 'ExpectedPrevoutForEveryInputInCoopSettlement'],
  },
  {
    args: makeArgs({prevouts: sweep.spends.concat(sweep.spends[0])}),
    description: 'Prevouts are expected to be unique',
    error: [400, 'UnexpectedDuplicatePrevoutInCoopSettlement'],
  },
  {
    args: makeArgs({psbt: makeDoubleSpendPsbt()}),
    description: 'Sweep inputs are expected to be unique',
    error: [
      400,
      'ExpectedValidPsbtToSignSettlement',
      {err: new Error('UnexpectedDuplicateInputOutpoint')},
    ],
  },
  {
    args: makeArgs({
      nonces: [makeArgs({}).nonces[0], makeArgs({}).nonces[0]],
    }),
    description: 'Utxos to sign are expected to be unique',
    error: [400, 'UnexpectedDuplicateUtxoInCoopSettlement'],
  },
  {
    args: makeArgs({
      nonces: [{...makeArgs({}).nonces[0], transaction_vout: 2}],
    }),
    description: 'Utxos to sign are expected to be swap utxos',
    error: [400, 'UnexpectedUtxoToSignInCoopSettlement'],
  },
  {
    args: makeArgs({
      nonces: [{
        nonce: serviceNonce(0),
        transaction_id: sha256('04').digest('hex'),
        transaction_vout: 0,
      }],
      swaps: [{
        utxos: utxos.concat({
          tokens: 1,
          transaction_id: sha256('04').digest('hex'),
          transaction_vout: 0,
        }),
        id,
        tokens: 251000,
      }],
    }),
    description: 'Utxos to sign are expected to be in the sweep',
    error: [400, 'ExpectedUtxoToSignInCoopSettlementInputs'],
  },
  {
    args: makeArgs({
      prevouts: [
        {...sweep.spends[0], tokens: 1},
        ...sweep.spends.slice(1),
      ],
    }),
    description: 'Utxos to sign are expected to spend their known value',
    error: [400, 'ExpectedSharedAddressSpendsInCoopSettlement'],
  },
  {
    args: makeArgs({
      prevouts: [{...sweep.spends[0], script: serverScript}]
        .concat(sweep.spends.slice(1)),
    }),
    description: 'Utxos to sign are expected to spend the shared address',
    error: [400, 'ExpectedSharedAddressSpendsInCoopSettlement'],
  },
  {
    args: makeArgs({
      prevouts: sweep.spends.slice(0, 2).concat({
        ...foreign,
        script: address.output_script,
      }),
    }),
    description: 'Shared address utxos in a sweep are expected to be known',
    error: [400, 'UnexpectedUnknownUtxoInCoopSettlement'],
  },
  {
    args: makeArgs({psbt: makeSweep({}).psbt}),
    description: 'Change is expected to go back to the shared address',
    error: [400, 'ExpectedChangeToSharedAddress', {change: 49000}],
  },
  {
    args: makeArgs({psbt: makeSweep({change: 48999}).psbt}),
    description: 'All of the change is expected back',
    error: [400, 'ExpectedChangeToSharedAddress', {change: 49000}],
  },
  {
    args: makeArgs({
      swaps: [
        {utxos, id, tokens: 251000},
        {utxos: [utxos[0]], id: otherId, tokens: 1000},
      ],
    }),
    description: 'A utxo is expected to be in only one swap',
    error: [400, 'UnexpectedUtxoInMultipleSwapsToSignSettlement'],
  },
  {
    args: makeArgs({
      swaps: [
        {utxos, id, tokens: 251000},
        {utxos, id: id.toUpperCase(), tokens: 300000},
      ],
    }),
    description: 'A swap is expected to be passed only once',
    error: [400, 'UnexpectedDuplicateSwapToSignSettlement'],
  },
  {
    args: makeArgs({
      prevouts: makeSweep({change: 49000, changeScript: serverScript}).spends,
      psbt: makeSweep({change: 49000, changeScript: serverScript}).psbt,
    }),
    description: 'Change is expected to pay to the shared address',
    error: [400, 'ExpectedChangeToSharedAddress', {change: 49000}],
  },
  {
    args: makeArgs({
      service: {pushStaticAddressSweeplessSigs: ({}, {}, cbk) => cbk('err')},
    }),
    description: 'Errors pushing signatures are passed back',
    error: [503, 'UnexpectedErrorPushingSettlementSigs', {err: 'err'}],
  },
  {
    args: makeArgs({lnd: makeLnd({sessionKey: address.internal_key})}),
    description: 'A session key that is not the shared address is rejected',
    error: [503, 'UnexpectedSessionKeyForSharedAddress'],
  },
  {
    args: makeArgs({
      prevouts: short.spends,
      psbt: short.psbt,
      swaps: [swap, otherSwap],
    }),
    description: 'A batch of swaps needs the change of every swap',
    error: [400, 'ExpectedChangeToSharedAddress', {change: 79000}],
  },
  {
    args: makeArgs({lnd: makeUnpaidLnd()}),
    description: 'No signing session is started for an unpaid swap',
    error: [425, 'ExpectedPaidSwapToSignSettlement'],
  },
  {
    args: makeArgs({}),
    description: 'Sign a sweep of swap in utxos',
    expected: settlementFor({...sweep, signing: nonces}),
  },
  {
    args: makeArgs({id: id.toUpperCase()}),
    description: 'Sign a sweep of a swap with an uppercase swap hash',
    expected: settlementFor({...sweep, signing: nonces}),
  },
  {
    args: makeArgs({
      prevouts: noChange.spends,
      psbt: noChange.psbt,
      swaps: [{utxos, id, tokens: 300000}],
    }),
    description: 'Sign a sweep of a swap without change',
    expected: settlementFor({...noChange, signing: nonces}),
  },
  {
    args: makeArgs({
      prevouts: full.spends,
      psbt: full.psbt,
      swaps: [swap, otherSwap],
    }),
    description: 'A batch of swaps is signed with the change of every swap',
    expected: settlementFor({...full, signing: nonces}),
  },
  {
    args: makeArgs({
      nonces: nonces.slice().reverse(),
      prevouts: sweep.spends.slice().reverse(),
    }),
    description: 'Prevouts and nonces can be in any order',
    expected: settlementFor({...sweep, signing: nonces.slice().reverse()}),
  },
  {
    args: makeArgs({
      nonces: nonces.map(upper),
      swaps: [{utxos: utxos.map(upper), id, tokens: 251000}],
    }),
    description: 'Signing info uses canonical utxo outpoints',
    expected: settlementFor({...sweep, signing: nonces}),
  },
];

tests.forEach(({args, description, error, expected}) => {
  return test(description, async () => {
    if (!!error) {
      await rejects(signSwapInCoopSettlement(args), error, 'Got error');
    } else {
      deepEqual(await settlementOf(args), expected, 'Got settlement');
    }

    return;
  });
});

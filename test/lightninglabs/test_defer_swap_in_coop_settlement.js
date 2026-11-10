const {deepEqual} = require('node:assert').strict;
const {rejects} = require('node:assert').strict;
const test = require('node:test');

const {createPsbt} = require('psbt');
const {decodePsbt} = require('psbt');
const {idForTransaction} = require('@alexbosworth/blockchain');

const {deferSwapInCoopSettlement} = require('./../../');

const id = Buffer.alloc(32, 9).toString('hex');
const metadata = {get: () => []};
const psbtError = 'ExpectedHexSerializedPartiallySignedBitcoinTransaction';

const {psbt} = createPsbt({
  outputs: [{script: `0014${Buffer.alloc(20).toString('hex')}`, tokens: 1e5}],
  utxos: [{id: Buffer.alloc(32, 1).toString('hex'), vout: 0}],
});

const transaction = decodePsbt({psbt}).unsigned_transaction;

// The push that tells the service that the swap is not finished yet
const deferral = {
  error_message: 'swap not finished yet',
  swap_hash: Buffer.from(id, 'hex'),
  txid: Buffer.from(idForTransaction({transaction}).id, 'hex').reverse(),
};

// A service that expects a push that defers the settlement
const deferringService = {
  pushStaticAddressSweeplessSigs: (args, auth, cbk) => {
    if (auth !== metadata) {
      return cbk([400, 'ExpectedAuthenticationMetadataPassedThrough']);
    }

    try {
      deepEqual(args, deferral);
    } catch (err) {
      return cbk([400, 'UnexpectedDeferralPush', {err}]);
    }

    return cbk();
  },
};

const makeArgs = overrides => {
  const args = {
    id,
    metadata,
    psbt,
    service: deferringService,
  };

  Object.keys(overrides).forEach(k => args[k] = overrides[k]);

  return args;
};

const tests = [
  {
    args: makeArgs({id: undefined}),
    description: 'A swap hash is expected',
    error: [400, 'ExpectedSwapHashToDeferSettlement'],
  },
  {
    args: makeArgs({metadata: undefined}),
    description: 'Authentication metadata is expected',
    error: [400, 'ExpectedAuthMetadataToDeferSettlement'],
  },
  {
    args: makeArgs({psbt: undefined}),
    description: 'A sweep PSBT is expected',
    error: [400, 'ExpectedPsbtToDeferSettlement'],
  },
  {
    args: makeArgs({service: {}}),
    description: 'A service is expected',
    error: [400, 'ExpectedServiceToDeferSettlement'],
  },
  {
    args: makeArgs({psbt: 'psbt'}),
    description: 'A valid PSBT is expected',
    error: [
      400,
      'ExpectedValidPsbtToDeferSettlement',
      {err: new Error(psbtError)},
    ],
  },
  {
    args: makeArgs({
      service: {pushStaticAddressSweeplessSigs: ({}, {}, cbk) => cbk('err')},
    }),
    description: 'Errors are passed back',
    error: [503, 'UnexpectedErrorDeferringSettlement', {err: 'err'}],
  },
  {
    args: makeArgs({}),
    description: 'Defer a swap in sweep',
    expected: undefined,
  },
];

tests.forEach(({args, description, error, expected}) => {
  return test(description, async () => {
    if (!!error) {
      await rejects(deferSwapInCoopSettlement(args), error, 'Got error');
    } else {
      deepEqual(await deferSwapInCoopSettlement(args), expected, 'Deferred');
    }

    return;
  });
});

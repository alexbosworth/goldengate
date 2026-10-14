const {deepEqual} = require('node:assert').strict;
const {rejects} = require('node:assert').strict;
const test = require('node:test');

const {hashForTree} = require('p2tr');

const fixtures = require('./../taproot/fixtures');
const {getCoopSignedTx} = require('./../../');

const bufferAsHex = buffer => buffer.toString('hex');
const fundingHash = '2e8aeea80aa054b666bbb268753ce4e1587b3c450046077a3bf8fc4a07c16386';
const fundingPayment = Buffer.alloc(32, 1).toString('hex');
const hashToSign = 'd1c13d08d4b04aeaf83e25f32b86b078b16f04c096c42212b2e70d3e90c42c58';
const localNonce = Buffer.alloc(66, 3).toString('hex');
const sweepPsbt = '70736274ff01005202000000010cb9318f1cbe8688e71ca9e61a9b2e361d1fb47adf92ee4152d274f15cca2ebd010000000000000000017a410f0000000000160014362a2872a1c9988ef71c31bb332dfff68d895f0d00000000000103040000000001012b40420f00000000002251205417babb3f2fbe2ae11eea7e61f30dfb25b326c7090002906bc7bb8a61f15ec50000';

const makeArgs = overrides => {
  const args = {
    fee_tokens_per_vbyte: 2,
    funding_hash: fundingHash,
    funding_payment: fundingPayment,
    key_family: 805,
    key_index: 0,
    lnd: {
      signer: {
        muSig2CombineSig: ({}, cbk) => cbk(null, {
          final_signature: Buffer.alloc(64, 7),
          have_all_signatures: true,
        }),
        muSig2CreateSession: ({}, cbk) => cbk(null, {
          combined_key: Buffer.alloc(32, 2),
          local_public_nonces: Buffer.from(localNonce, 'hex'),
          session_id: Buffer.alloc(32, 4),
          taproot_internal_key: Buffer.alloc(32, 5),
        }),
        muSig2RegisterNonces: ({}, cbk) => cbk(null, {have_all_nonces: true}),
        muSig2Sign: (args, cbk) => {
          if (bufferAsHex(args.message_digest) !== hashToSign) {
            return cbk([400, 'InvalidMessageDigestSpecified']);
          }

          return cbk(null, {local_partial_signature: Buffer.alloc(32, 6)});
        },
      },
      wallet: {
        deriveKey: ({}, cbk) => cbk(null, {
          key_loc: {key_index: 0},
          raw_key_bytes: Buffer.from(fixtures.internal_key, 'hex'),
        }),
      },
    },
    network: 'btctestnet',
    output_script: fixtures.output_script,
    public_keys: [
      '031cb9fba5d8cbc3dad06185e49de60fac484944c3c12682b604e0261b5375d3bf',
    ],
    root_hash: hashForTree({branches: fixtures.script_branches}).hash,
    script_branches: fixtures.script_branches,
    service: {
      muSig2SignSweep: (args, metadata, cbk) => {
        if (bufferAsHex(args.nonce) !== localNonce) {
          return cbk([400, 'InvalidNonceSpecified']);
        }

        if (bufferAsHex(args.payment_address) !== fundingPayment) {
          return cbk([400, 'InvalidPaymentAddressSpecified']);
        }

        if (args.protocol_version !== 'MUSIG2') {
          return cbk([400, 'InvalidProtocolVersionSpecified']);
        }

        if (bufferAsHex(args.swap_hash) !== fundingHash) {
          return cbk([400, 'InvalidSwapHashSpecified']);
        }

        if (bufferAsHex(args.sweep_tx_psbt) !== sweepPsbt) {
          return cbk([400, 'InvalidSweepPsbtSpecified']);
        }

        return cbk(null, {
          nonce: Buffer.alloc(66, 8),
          partial_signature: Buffer.alloc(32, 9),
        });
      },
    },
    sweep_address: fixtures.sweep_address,
    tokens: 1e6,
    transaction_id: fixtures.transaction_id,
    transaction_vout: 1,
  };

  Object.keys(overrides).forEach(k => args[k] = overrides[k]);

  return args;
};

const tests = [
  {
    args: makeArgs({}),
    description: 'A cooperatively signed taproot sweep is assembled',
    expected: {
      transaction: '020000000001010cb9318f1cbe8688e71ca9e61a9b2e361d1fb47adf92ee4152d274f15cca2ebd010000000000000000017a410f0000000000160014362a2872a1c9988ef71c31bb332dfff68d895f0d0140' + '07'.repeat(64) + '00000000',
    },
  },
  {
    args: makeArgs({fee_tokens_per_vbyte: undefined}),
    description: 'A fee rate is expected',
    error: [400, 'ExpectedChainFeeRateToGetCoopSignedTransaction'],
  },
  {
    args: makeArgs({funding_hash: undefined}),
    description: 'A funding hash is expected',
    error: [400, 'ExpectedFundingPreimageHashToGetCoopSignedTx'],
  },
  {
    args: makeArgs({funding_payment: undefined}),
    description: 'A funding payment nonce is expected',
    error: [400, 'ExpectedPaymentNonceToGetCoopSignedTransaction'],
  },
  {
    args: makeArgs({key_family: undefined}),
    description: 'A key family is expected',
    error: [400, 'ExpectedKeyFamilyToGetCoopSignedTransaction'],
  },
  {
    args: makeArgs({key_index: undefined}),
    description: 'A key index is expected',
    error: [400, 'ExpectedKeyIndexToGetCoopSignedTransaction'],
  },
  {
    args: makeArgs({lnd: undefined}),
    description: 'LND is expected',
    error: [400, 'ExpectedAuthenticatedLndToGetCoopSignedTx'],
  },
  {
    args: makeArgs({network: undefined}),
    description: 'A network is expected',
    error: [400, 'ExpectedNetworkNameToGetCoopSignedTransaction'],
  },
  {
    args: makeArgs({output_script: undefined}),
    description: 'An output script is expected',
    error: [400, 'ExpectedOutputScriptToGetCoopSignedTransaction'],
  },
  {
    args: makeArgs({public_keys: undefined}),
    description: 'Public keys are expected',
    error: [400, 'ExpectedArrayOfPublicKeysToGetCoopSignedTx'],
  },
  {
    args: makeArgs({root_hash: undefined}),
    description: 'A root hash is expected',
    error: [400, 'ExpectedRootHashToGetCoopSignedTx'],
  },
  {
    args: makeArgs({script_branches: undefined}),
    description: 'Script branches are expected',
    error: [400, 'ExpectedArrayOfBranchesToGetCoopSignedTx'],
  },
  {
    args: makeArgs({service: undefined}),
    description: 'A swap service is expected',
    error: [400, 'ExpectedSwapServiceToGetCoopSignedTransaction'],
  },
  {
    args: makeArgs({sweep_address: undefined}),
    description: 'A sweep address is expected',
    error: [400, 'ExpectedSweepAddressToGetCoopSignedTx'],
  },
  {
    args: makeArgs({tokens: undefined}),
    description: 'Tokens are expected',
    error: [400, 'ExpectedSweepTokensToGetCoopSignedTx'],
  },
  {
    args: makeArgs({transaction_id: undefined}),
    description: 'A transaction id is expected',
    error: [400, 'ExpectedTransactionIdToGetCoopSignedTx'],
  },
  {
    args: makeArgs({transaction_vout: undefined}),
    description: 'A transaction output index is expected',
    error: [400, 'ExpectedTransactionOutputIndexToGetCoopSignedTx'],
  },
  {
    args: makeArgs({sweep_address: 'sweep_address'}),
    description: 'A valid sweep address is expected',
    error: [400, 'FailedToAddSweepAddressOutputCalculatingTaprootOutputs'],
  },
  {
    args: makeArgs({
      service: {muSig2SignSweep: ({}, metadata, cbk) => cbk('err')},
    }),
    description: 'An error getting the server signature is passed back',
    error: [503, 'UnexpectedErrorGettingCoopSignedTx', {err: 'err'}],
  },
  {
    args: makeArgs({
      service: {muSig2SignSweep: ({}, metadata, cbk) => cbk()},
    }),
    description: 'A response from the server is expected',
    error: [503, 'ExpectedResponseForCoopSignTxRequest'],
  },
  {
    args: makeArgs({
      service: {
        muSig2SignSweep: ({}, metadata, cbk) => cbk(null, {
          partial_signature: Buffer.alloc(32, 9),
        }),
      },
    }),
    description: 'A server nonce is expected',
    error: [503, 'ExpectedCoopSignNonceInCoopSignResponse'],
  },
  {
    args: makeArgs({
      service: {
        muSig2SignSweep: ({}, metadata, cbk) => cbk(null, {
          nonce: Buffer.alloc(66, 8),
        }),
      },
    }),
    description: 'A server partial signature is expected',
    error: [503, 'ExpectedCoopPartialSigInCoopSignResponse'],
  },
];

tests.forEach(({args, description, error, expected}) => {
  return test(description, async () => {
    if (!!error) {
      await rejects(getCoopSignedTx(args), error, 'Got expected error');
    } else {
      const res = await getCoopSignedTx(args);

      deepEqual(res, expected, 'Got expected result');
    }

    return;
  });
});

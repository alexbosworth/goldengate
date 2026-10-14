const {equal} = require('node:assert').strict;
const {rejects} = require('node:assert').strict;
const test = require('node:test');

const {componentsOfTransaction} = require('@alexbosworth/blockchain');
const {hashForTree} = require('p2tr');
const {v1OutputScript} = require('p2tr');

const {attemptTaprootClaim} = require('./../../');
const fixtures = require('./fixtures');
const {taprootClaimTransaction} = require('./../../');

const bufferAsHex = buffer => buffer.toString('hex');
const defaultInternalKey = fixtures.internal_key;
const height = 1571579;
const internalKey = '9a52e5049486097409dc92b476a0c72fcc24021d2c7d3bbf91789745041a488a';
const lnd = {wallet: {publishTransaction: ({}, cbk) => cbk(null, {})}};

const controlKey = transaction => {
  const [{witness}] = componentsOfTransaction({transaction}).inputs;

  const [control] = witness.slice().reverse();

  // The internal key follows the leaf version byte
  return control.slice(2, 66);
};

const output = v1OutputScript({
  hash: hashForTree({branches: fixtures.script_branches}).hash,
  internal_key: internalKey,
});

const makeArgs = overrides => {
  const args = {
    lnd,
    claim_script: fixtures.claim_script,
    current_height: height,
    deadline_height: height + 144,
    external_key: output.external_key,
    internal_key: internalKey,
    is_dry_run: true,
    max_fee_multiplier: 1000,
    min_fee_rate: 2,
    network: 'btctestnet',
    output_script: output.script,
    private_key: fixtures.claim_private_key,
    script_branches: fixtures.script_branches,
    secret: fixtures.secret,
    start_height: height,
    sweep_address: fixtures.sweep_address,
    tokens: 1e6,
    transaction_id: fixtures.transaction_id,
    transaction_vout: 1,
  };

  Object.keys(overrides).forEach(k => args[k] = overrides[k]);

  return args;
};

const makeClaim = args => {
  return taprootClaimTransaction({
    block_height: args.current_height,
    claim_script: args.claim_script,
    external_key: args.external_key,
    fee_tokens_per_vbyte: args.min_fee_rate,
    internal_key: args.internal_key,
    network: args.network,
    output_script: args.output_script,
    private_key: args.private_key,
    script_branches: args.script_branches,
    secret: args.secret,
    sends: [],
    sweep_address: args.sweep_address,
    tokens: args.tokens,
    transaction_id: args.transaction_id,
    transaction_vout: args.transaction_vout,
  });
};

const tests = [
  {
    args: makeArgs({claim_script: undefined}),
    description: 'A claim script is expected',
    error: [400, 'ExpectedClaimLeafScriptToAttemptTaprootClaim'],
  },
  {
    args: makeArgs({current_height: undefined}),
    description: 'A current height is expected',
    error: [400, 'ExpectedCurrentHeightToAttemptTaprootClaim'],
  },
  {
    args: makeArgs({deadline_height: undefined}),
    description: 'A deadline height is expected',
    error: [400, 'ExpectedDeadlineHeightToAttemptTaprootClaim'],
  },
  {
    args: makeArgs({external_key: undefined}),
    description: 'An external key is expected',
    error: [400, 'ExpectedExternalKeyToAttemptTaprootClaimSweep'],
  },
  {
    args: makeArgs({lnd: undefined}),
    description: 'Either lnd or request is expected',
    error: [400, 'ExpectedEitherLndOrRequestToAttemptClaimSweep'],
  },
  {
    args: makeArgs({max_fee_multiplier: undefined}),
    description: 'A max fee multiplier is expected',
    error: [400, 'ExpectedMaxFeeMultiplierToAttemptClaimSweep'],
  },
  {
    args: makeArgs({network: undefined}),
    description: 'A network is expected',
    error: [400, 'ExpectedNetworkNameToAttemptTaprootClaimSweep'],
  },
  {
    args: makeArgs({output_script: undefined}),
    description: 'An output script is expected',
    error: [400, 'ExpectedOutputScriptToAttemptTaprootClaimSweep'],
  },
  {
    args: makeArgs({private_key: undefined}),
    description: 'A private key is expected',
    error: [400, 'ExpectedClaimPrivKeyToAttemptTaprootClaimSweep'],
  },
  {
    args: makeArgs({script_branches: undefined}),
    description: 'Script branches are expected',
    error: [400, 'ExpectedScriptBranchesToAttemptTaprootClaim'],
  },
  {
    args: makeArgs({secret: undefined}),
    description: 'A secret is expected',
    error: [400, 'ExpectedSweepSecretToAttemptTaprootClaimSweep'],
  },
  {
    args: makeArgs({start_height: undefined}),
    description: 'A start height is expected',
    error: [400, 'ExpectedSweepingStartHeightToAttemptNewSweep'],
  },
  {
    args: makeArgs({sweep_address: undefined}),
    description: 'A sweep address is expected',
    error: [400, 'ExpectedSweepAddressToExecuteTaprootClaimSweep'],
  },
  {
    args: makeArgs({tokens: undefined}),
    description: 'Tokens are expected',
    error: [400, 'ExpectedSwapTokensToExecuteTaprootClaimSweep'],
  },
  {
    args: makeArgs({transaction_id: undefined}),
    description: 'A transaction id is expected',
    error: [400, 'ExpectedDepositTransactionIdToAttemptClaimSweep'],
  },
  {
    args: makeArgs({transaction_vout: undefined}),
    description: 'A transaction output index is expected',
    error: [400, 'ExpectedDepositTxVoutToAttemptTaprootClaimSweep'],
  },
  {
    args: makeArgs({deadline_height: height}),
    description: 'A deadline height after the start height is expected',
    error: [500, 'FailedToCalculateConfirmationFeeRate'],
  },
  {
    args: makeArgs({network: 'btc'}),
    description: 'A sweep address for the network is expected',
    error: [500, 'FailedToGenerateTaprootClaimTransaction'],
  },
  {
    args: makeArgs({
      is_dry_run: false,
      lnd: {wallet: {publishTransaction: ({}, cbk) => cbk('err')}},
    }),
    description: 'A claim that fails to publish returns the publish error',
    error: [503, 'UnexpectedErrBroadcastingRawTx', {err: 'err'}],
  },
  {
    args: makeArgs({}),
    description: 'A claim spends with the internal key',
    expected: {fee_rate: 2, internal_key: internalKey},
  },
  {
    args: makeArgs({internal_key: `03${internalKey}`}),
    description: 'A compressed internal key is used in x-only form',
    expected: {fee_rate: 2, internal_key: internalKey},
  },
  {
    args: makeArgs({internal_key: undefined}),
    description: 'A claim without an internal key uses the default key',
    expected: {fee_rate: 2, internal_key: defaultInternalKey},
  },
  {
    args: makeArgs({
      lnd: {
        wallet: {estimateFee: ({}, cbk) => cbk(null, {sat_per_kw: 1250})},
      },
      min_fee_rate: undefined,
    }),
    description: 'A claim without a minimum fee rate uses the chain fee rate',
    expected: {fee_rate: 5, internal_key: internalKey},
  },
  {
    args: makeArgs({
      lnd: {wallet: {estimateFee: ({}, cbk) => cbk('err')}},
      min_fee_rate: undefined,
    }),
    description: 'A claim uses the default fee rate when the chain fee fails',
    expected: {fee_rate: 1, internal_key: internalKey},
  },
  {
    args: makeArgs({
      is_dry_run: false,
      lnd: {
        wallet: {
          publishTransaction: ({tx_hex}, cbk) => {
            const {transaction} = makeClaim(makeArgs({}));

            if (bufferAsHex(tx_hex) !== transaction) {
              return cbk('ExpectedClaimTransactionToPublish');
            }

            return cbk(null, {});
          },
        },
      },
    }),
    description: 'A claim is published',
    expected: {fee_rate: 2, internal_key: internalKey},
  },
];

tests.forEach(({args, description, error, expected}) => {
  return test(description, async () => {
    if (!!error) {
      await rejects(attemptTaprootClaim(args), error, 'Got expected error');

      return;
    }

    const res = await attemptTaprootClaim(args);

    equal(res.fee_rate, expected.fee_rate, 'Claim uses the fee rate');
    equal(res.min_fee_rate, expected.fee_rate, 'Got the minimum fee rate');

    const expectedClaim = makeClaim({
      ...args,
      internal_key: expected.internal_key,
      min_fee_rate: expected.fee_rate,
    });

    equal(res.transaction, expectedClaim.transaction, 'Got claim transaction');

    equal(controlKey(res.transaction), expected.internal_key, 'Got key');

    return;
  });
});

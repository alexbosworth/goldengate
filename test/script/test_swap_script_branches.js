const {deepEqual} = require('node:assert').strict;
const test = require('node:test');
const {throws} = require('node:assert').strict;

const fixtures = require('./../taproot/fixtures');
const method = require('./../../script/swap_script_branches');

const claimPublicKey = '039a52e5049486097409dc92b476a0c72fcc24021d2c7d3bbf91789745041a488a';
const hash = '2e8aeea80aa054b666bbb268753ce4e1587b3c450046077a3bf8fc4a07c16386';
const refundPublicKey = '031cb9fba5d8cbc3dad06185e49de60fac484944c3c12682b604e0261b5375d3bf';
const timeout = 1571879;

const tests = [
  {
    args: {
      timeout,
      claim_private_key: fixtures.claim_private_key,
      refund_public_key: refundPublicKey,
      secret: fixtures.secret,
    },
    description: 'Got the script branches for a claim private key and secret',
    expected: {
      hash,
      branches: fixtures.script_branches,
      claim: fixtures.claim_script,
      refund: fixtures.refund_script,
    },
  },
  {
    args: {
      hash,
      timeout,
      claim_public_key: claimPublicKey,
      refund_private_key: fixtures.refund_private_key,
    },
    description: 'Got the script branches for a refund private key and hash',
    expected: {
      hash,
      branches: fixtures.script_branches,
      claim: fixtures.claim_script,
      refund: fixtures.refund_script,
    },
  },
  {
    args: {
      timeout,
      refund_public_key: refundPublicKey,
      secret: fixtures.secret,
    },
    description: 'A claim private key or public key is expected',
    error: 'ExpectedEitherPrivateKeyOrPublicKeyForSwapBranches',
  },
  {
    args: {
      timeout,
      claim_private_key: fixtures.claim_private_key,
      refund_public_key: refundPublicKey,
    },
    description: 'A secret or hash is expected',
    error: 'ExpectedEitherHashOrSecretForSwapScriptBranches',
  },
  {
    args: {hash, timeout, claim_public_key: claimPublicKey},
    description: 'A refund private key or public key is expected',
    error: 'ExpectedRefundPublicOrPrivateKeyForSwapScriptBranches',
  },
  {
    args: {
      hash,
      claim_public_key: claimPublicKey,
      refund_private_key: fixtures.refund_private_key,
    },
    description: 'A timeout is expected',
    error: 'ExpectedSwapTimeoutExpirationCltvForSwapScriptBranches',
  },
  {
    args: {
      claim_private_key: fixtures.claim_private_key,
      refund_public_key: refundPublicKey,
      secret: fixtures.secret,
      timeout: 5e8,
    },
    description: 'A block height timeout is expected',
    error: 'FailedToComposeSwapScriptBranchElements',
  },
  {
    args: {
      timeout,
      claim_private_key: Buffer.alloc(32).toString('hex'),
      refund_public_key: refundPublicKey,
      secret: fixtures.secret,
    },
    description: 'A valid claim private key is expected',
    error: 'FailedToComposeSwapScriptBranchElements',
  },
];

tests.forEach(({args, description, error, expected}) => {
  return test(description, (t, end) => {
    if (!!error) {
      throws(() => method(args), new Error(error), 'Got expected error');
    } else {
      deepEqual(method(args), expected, 'Got expected result');
    }

    return end();
  });
});

const {crypto} = require('bitcoinjs-lib');
const {ECPair} = require('bitcoinjs-lib');
const {test} = require('@alexbosworth/tap');
const {Transaction} = require('bitcoinjs-lib');

const {claimTransaction} = require('./../../');
const {swapScript} = require('./../../script');

const privateKey = ECPair.makeRandom().privateKey.toString('hex');

const {script} = swapScript({
  claim_private_key: privateKey,
  refund_public_key: ECPair.makeRandom().publicKey.toString('hex'),
  secret: Buffer.alloc(32).toString('hex'),
  timeout: 1571879,
});

const makeArgs = overrides => {
  const args = {
    block_height: 1571579,
    fee_tokens_per_vbyte: 1,
    network: 'btctestnet',
    private_key: ECPair.makeRandom().privateKey.toString('hex'),
    secret: Buffer.alloc(32).toString('hex'),
    sweep_address: 'tb1qxc4zsu4pexvgaacuxxanxt0l76xcjhcd252g4u',
    tokens: 1e4,
    transaction_id: 'bd2eca5cf174d25241ee92df7ab41f1d362e9b1ae6a91ce78886be1c8f31b90c',
    transaction_vout: 0,
    witness_script: script,
  };

  Object.keys(overrides).forEach(k => args[k] = overrides[k]);

  return args;
};

const tests = [
  {
    args: makeArgs({block_height: undefined}),
    description: 'A block height is required',
    error: 'ExpectedBlockHeightForClaimTransaction',
  },
  {
    args: makeArgs({fee_tokens_per_vbyte: undefined}),
    description: 'Fee rate is required',
    error: 'ExpectedFeeTokensPerVbyte',
  },
  {
    args: makeArgs({network: undefined}),
    description: 'Network is required',
    error: 'ExpectedNetworkNameForClaimTransaction',
  },
  {
    args: makeArgs({network: 'network'}),
    description: 'Known network is required',
    error: 'ExpectedNetworkNameForClaimTransaction',
  },
  {
    args: makeArgs({private_key: undefined}),
    description: 'Private key is required',
    error: 'ExpectedPrivateKeyForClaimTransaction',
  },
  {
    args: makeArgs({secret: undefined}),
    description: 'Preimage is required',
    error: 'ExpectedPreimageSecretForClaimTransaction',
  },
  {
    args: makeArgs({sweep_address: undefined}),
    description: 'A sweep address is required',
    error: 'ExpectedSweepAddressForClaimTransaction',
  },
  {
    args: makeArgs({tokens: undefined}),
    description: 'Tokens are required',
    error: 'ExpectedTokensForClaimTransaction',
  },
  {
    args: makeArgs({tokens: -1}),
    description: 'A valid tokens value is required',
    error: 'FailedToAddSweepAddressOutputScript',
  },
  {
    args: makeArgs({transaction_id: undefined}),
    description: 'A transaction id is required',
    error: 'ExpectedTransactionIdForClaimTransaction',
  },
  {
    args: makeArgs({transaction_vout: undefined}),
    description: 'A transaction vout is required',
    error: 'ExpectedTransactionVoutForClaimTransaction',
  },
  {
    args: makeArgs({witness_script: undefined}),
    description: 'A witness script is required',
    error: 'ExpectedWitnessScriptForClaimTransaction',
  },
  {
    args: makeArgs({witness_script: '00'}),
    description: 'A known witness script type is required',
    error: 'ExpectedKnownSwapScriptTypeForClaimTransaction',
  },
  {
    args: makeArgs({}),
    description: 'Claim transaction formed',
    expected: {
      input_hash: '0cb9318f1cbe8688e71ca9e61a9b2e361d1fb47adf92ee4152d274f15cca2ebd',
      input_index: 0,
      input_script: '',
      input_sequence: 1,
      locktime: 1571579,
      out_script: '0014362a2872a1c9988ef71c31bb332dfff68d895f0d',
      out_value: 9864,
      version: 2,
      witness_script: script,
      witness_unlock: Buffer.alloc(32).toString('hex'),
    },
  },
  {
    args: makeArgs({
      sends: [{
        address: 'tb1qsmd28ztyvef6f4z86tpfahh2q6vl039lvt3t9m5luk7mdmpphq4sf3spnr',
        tokens: 1e5,
      }],
    }),
    description: 'Claim transaction formed',
    expected: {
      input_hash: '0cb9318f1cbe8688e71ca9e61a9b2e361d1fb47adf92ee4152d274f15cca2ebd',
      input_index: 0,
      input_script: '',
      input_sequence: 1,
      locktime: 1571579,
      out_script: '0014362a2872a1c9988ef71c31bb332dfff68d895f0d',
      out_value: 9864,
      version: 2,
      witness_script: script,
      witness_unlock: Buffer.alloc(32).toString('hex'),
    },
  },
];

tests.forEach(({args, description, error, expected}) => {
  return test(description, ({equal, end, throws}) => {
    if (!!error) {
      throws(() => claimTransaction(args), new Error(error), 'Got error');
    } else {
      const tx = Transaction.fromHex(claimTransaction(args).transaction);

      const [input] = tx.ins;
      const [out] = tx.outs;

      const [witnessSig, witnessUnlock, witnessScript] = input.witness;

      equal(input.hash.toString('hex'), expected.input_hash, 'Input hash');
      equal(input.index, expected.input_index, 'Input index as expected');
      equal(input.script.toString('hex'), expected.input_script, 'Got script');
      equal(input.sequence, expected.input_sequence, 'Got input sequence');
      equal(out.script.toString('hex'), expected.out_script, 'Got out script');
      equal(out.value, expected.out_value, 'Output value as expected');
      equal(tx.locktime, expected.locktime, 'Tx locktime as expected');
      equal(tx.version, expected.version, 'Transaction version as expected');
      equal(!!witnessSig, true, 'Witness signature returned');
      equal(witnessUnlock.toString('hex'), expected.witness_unlock, 'Unlock');
      equal(witnessScript.toString('hex'), expected.witness_script, 'Script');
    }

    return end();
  });
});

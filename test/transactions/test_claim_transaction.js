const {equal} = require('node:assert').strict;
const test = require('node:test');
const {throws} = require('node:assert').strict;

const {componentsOfTransaction} = require('@alexbosworth/blockchain');
const {verify} = require('tiny-secp256k1');

const {claimTransaction} = require('./../../');
const {swapScript} = require('./../../script');

const asScalar = n => Buffer.concat([Buffer.alloc(32), n]).subarray(-32);
const derHeaderLength = 2;
const derValue = n => n.subarray(derHeaderLength, derHeaderLength + n[1]);
const hexAsBuffer = hex => Buffer.from(hex, 'hex');
const privateKey = '4af38565a8bb19480057f375400105fcfb3b6534c32fbc1039df496421012b0d';
const publicKey = '039a52e5049486097409dc92b476a0c72fcc24021d2c7d3bbf91789745041a488a';
const secret = 'bdb8e03b149a48e3c706663b8cee7c7590bee386d5d8b5620fd504c848437e6e';

const derAsCompact = der => {
  const sequence = derValue(hexAsBuffer(der));

  const r = derValue(sequence);

  // The S integer follows the R integer header and value
  const s = derValue(sequence.subarray(derHeaderLength + r.length));

  return Buffer.concat([asScalar(r), asScalar(s)]);
};

const makeArgs = overrides => {
  const args = {
    block_height: 1571579,
    fee_tokens_per_vbyte: 1,
    network: 'btctestnet',
    private_key: '4af38565a8bb19480057f375400105fcfb3b6534c32fbc1039df496421012b0d',
    secret: Buffer.alloc(32).toString('hex'),
    sweep_address: 'tb1qxc4zsu4pexvgaacuxxanxt0l76xcjhcd252g4u',
    tokens: 1e4,
    transaction_id: 'bd2eca5cf174d25241ee92df7ab41f1d362e9b1ae6a91ce78886be1c8f31b90c',
    transaction_vout: 0,
    witness_script: true,
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
    error: 'FailedToAddSweepAddressOutputScriptCalculatingOutputs',
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
      input_id: 'bd2eca5cf174d25241ee92df7ab41f1d362e9b1ae6a91ce78886be1c8f31b90c',
      input_index: 0,
      input_script: '',
      input_sequence: 1,
      locktime: 1571579,
      out_script: '0014362a2872a1c9988ef71c31bb332dfff68d895f0d',
      out_value: 9864,
      version: 2,
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
      input_id: 'bd2eca5cf174d25241ee92df7ab41f1d362e9b1ae6a91ce78886be1c8f31b90c',
      input_index: 0,
      input_script: '',
      input_sequence: 1,
      locktime: 1571579,
      out_script: '0014362a2872a1c9988ef71c31bb332dfff68d895f0d',
      out_value: 9864,
      version: 2,
      witness_unlock: Buffer.alloc(32).toString('hex'),
    },
  },
  {
    args: makeArgs({
      secret,
      fee_tokens_per_vbyte: 2,
      tokens: 1e5,
      transaction_vout: 1,
      witness_script: '8201208763a914c792bea2f08a4dcada80a2e848e01f236bd139278821039a52e5049486097409dc92b476a0c72fcc24021d2c7d3bbf91789745041a488a67750327fc17b17521031cb9fba5d8cbc3dad06185e49de60fac484944c3c12682b604e0261b5375d3bf68ac',
    }),
    description: 'Signed v1 claim transaction formed',
    expected: {
      sighash: 'b38c49f7366138941a728ce228b611954f4d126d22c725589fe277c2ed5b9b76',
      signature_index: 0,
      transaction: '020000000001010cb9318f1cbe8688e71ca9e61a9b2e361d1fb47adf92ee4152d274f15cca2ebd010000000001000000019085010000000000160014362a2872a1c9988ef71c31bb332dfff68d895f0d03483045022100b675fc27bbd1ef2f2b611d0be950040eb945468de82e8a17083cd2887338f63002202a80d279d69806950b883c6c42f3cd0aef4331fd67b44a33c68186a67021ad4e0120bdb8e03b149a48e3c706663b8cee7c7590bee386d5d8b5620fd504c848437e6e6a8201208763a914c792bea2f08a4dcada80a2e848e01f236bd139278821039a52e5049486097409dc92b476a0c72fcc24021d2c7d3bbf91789745041a488a67750327fc17b17521031cb9fba5d8cbc3dad06185e49de60fac484944c3c12682b604e0261b5375d3bf68acfbfa1700',
    },
  },
  {
    args: makeArgs({
      secret,
      fee_tokens_per_vbyte: 2,
      tokens: 1e5,
      transaction_vout: 1,
      witness_script: '21039a52e5049486097409dc92b476a0c72fcc24021d2c7d3bbf91789745041a488aac6476a914382f1ac022fce4ff91259403111a6ebaf1e4831a88ad0327fc17b16782012088a914c792bea2f08a4dcada80a2e848e01f236bd139278851b268',
    }),
    description: 'Signed v2 claim transaction formed',
    expected: {
      sighash: '2eca09de9b45d3bfc472eec545d54dda556ccaac28c0374baf509bd43a83474c',
      signature_index: 1,
      transaction: '020000000001010cb9318f1cbe8688e71ca9e61a9b2e361d1fb47adf92ee4152d274f15cca2ebd010000000001000000019485010000000000160014362a2872a1c9988ef71c31bb332dfff68d895f0d0320bdb8e03b149a48e3c706663b8cee7c7590bee386d5d8b5620fd504c848437e6e463043022030bd7535e6c3b43e89967b9472f29720ace31e9647250bebd08865e8181abcd6021f7ca23d84267d19953409d894d84008c9fe2c7bf4aaa570bd95f746265df504016121039a52e5049486097409dc92b476a0c72fcc24021d2c7d3bbf91789745041a488aac6476a914382f1ac022fce4ff91259403111a6ebaf1e4831a88ad0327fc17b16782012088a914c792bea2f08a4dcada80a2e848e01f236bd139278851b268fbfa1700',
    },
  },
];

tests.forEach(({args, description, error, expected}) => {
  return test(description, async () => {
    if (args.witness_script === true) {
      const {script} = swapScript({
        claim_private_key: privateKey,
        refund_public_key: Buffer.alloc(33, 3).toString('hex'),
        secret: Buffer.alloc(32).toString('hex'),
        timeout: 1571879,
      });

      args.witness_script = script;

      if (!error) {
        expected.witness_script = script;
      }
    }

    if (!!error) {
      throws(() => claimTransaction(args), new Error(error), 'Got error');
    } else if (!!expected.sighash) {
      const {transaction} = claimTransaction(args);

      const [{witness}] = componentsOfTransaction({transaction}).inputs;

      const signature = witness[expected.signature_index];

      const isValid = verify(
        hexAsBuffer(expected.sighash),
        hexAsBuffer(publicKey),
        derAsCompact(signature)
      );

      equal(transaction, expected.transaction, 'Got expected transaction');
      equal(isValid, true, 'Signature is valid for the hash to sign');
      equal(signature.slice(-2), '01', 'Signature has the sighash all flag');
    } else {
      const {transaction} = claimTransaction(args);

      const tx = componentsOfTransaction({transaction});

      const [input] = tx.inputs;
      const [out] = tx.outputs;

      const [witnessSig, witnessUnlock, witnessScript] = input.witness;

      equal(input.id, expected.input_id, 'Input spends expected tx id');
      equal(input.vout, expected.input_index, 'Input index as expected');
      equal(input.script, expected.input_script, 'Got script');
      equal(input.sequence, expected.input_sequence, 'Got input sequence');
      equal(out.script, expected.out_script, 'Got out script');
      equal(out.tokens, expected.out_value, 'Output value as expected');
      equal(tx.locktime, expected.locktime, 'Tx locktime as expected');
      equal(tx.version, expected.version, 'Transaction version as expected');
      equal(!!witnessSig, true, 'Witness signature returned');
      equal(witnessUnlock, expected.witness_unlock, 'Unlock');
      equal(witnessScript, expected.witness_script, 'Script');
    }

    return;
  });
});

const {equal} = require('node:assert').strict;
const test = require('node:test');
const {throws} = require('node:assert').strict;

const {componentsOfTransaction} = require('@alexbosworth/blockchain');
const {ECPair} = require('ecpair');
const tinysecp = require('tiny-secp256k1');

const {refundTransaction} = require('./../../transactions');

const tests = [
  {
    args: {},
    description: 'Height is required',
    error: 'ExpectedLocktimeHeightForRefundTransaction',
  },
  {
    args: {block_height: 1},
    description: 'Fee rate is required',
    error: 'ExpectedFeeRateToUseForRefundTransaction',
  },
  {
    args: {block_height: 1, fee_tokens_per_vbyte: 1},
    description: 'Network is required',
    error: 'ExpectedKnownNetworkForRefundTransaction',
  },
  {
    args: {block_height: 1, fee_tokens_per_vbyte: 1, network: 'foo'},
    description: 'Known network is required',
    error: 'ExpectedKnownNetworkForRefundTransaction',
  },
  {
    args: {block_height: 1, fee_tokens_per_vbyte: 1, network: 'btc'},
    description: 'Sweep address is required',
    error: 'ExpectedDestinationForRefundTransactionToSweepOutTo',
  },
  {
    args: {
      block_height: 1,
      fee_tokens_per_vbyte: 1,
      network: 'btctestnet',
      sweep_address: 'tb1qxc4zsu4pexvgaacuxxanxt0l76xcjhcd252g4u',
    },
    description: 'Sweep tokens is required',
    error: 'ExpectedUtxoTokensAmountForRefundTransaction',
  },
  {
    args: {
      block_height: 1,
      fee_tokens_per_vbyte: 1,
      network: 'btctestnet',
      sweep_address: 'tb1qxc4zsu4pexvgaacuxxanxt0l76xcjhcd252g4u',
      tokens: 1,
    },
    description: 'Transaction id required',
    error: 'ExpectedTransactionIdToCreateRefundTransaction',
  },
  {
    args: {
      block_height: 1,
      fee_tokens_per_vbyte: 1,
      network: 'btctestnet',
      sweep_address: 'tb1qxc4zsu4pexvgaacuxxanxt0l76xcjhcd252g4u',
      tokens: 1,
      transaction_id: 'bd2eca5cf174d25241ee92df7ab41f1d362e9b1ae6a91ce78886be1c8f31b90c',
    },
    description: 'Transaction vout required',
    error: 'ExpectedTransactionVoutToCreateRefundTransaction',
  },
  {
    args: {
      block_height: 1,
      fee_tokens_per_vbyte: 1,
      network: 'btctestnet',
      sweep_address: 'tb1qxc4zsu4pexvgaacuxxanxt0l76xcjhcd252g4u',
      tokens: 1,
      transaction_id: 'bd2eca5cf174d25241ee92df7ab41f1d362e9b1ae6a91ce78886be1c8f31b90c',
      transaction_vout: 0,
    },
    description: 'Witness script required',
    error: 'ExpectedWitnessScriptForRefundTransaction',
  },
  {
    args: {
      block_height: 1571579,
      fee_tokens_per_vbyte: 1,
      is_nested: true,
      network: 'btctestnet',
      private_key: '4af38565a8bb19480057f375400105fcfb3b6534c32fbc1039df496421012b0d',
      sweep_address: 'tb1qxc4zsu4pexvgaacuxxanxt0l76xcjhcd252g4u',
      tokens: 1,
      transaction_id: 'bd2eca5cf174d25241ee92df7ab41f1d362e9b1ae6a91ce78886be1c8f31b90c',
      transaction_vout: 0,
      witness_script: '8201208763a914d1a70126ff7a149ca6f9b638db084480440ff8428821000000000000000000000000000000000000000000000000000000000000000000677503fbfa17b175210280a5a994052abe443adb74851387b389386306c690a94ddf3bfd71234cd2a72b68ac',
    },
    description: 'Refund transaction formed',
    error: 'ExpectedMoreTokensForRefundTransaction',
  },
  {
    args: {
      block_height: 1571579,
      fee_tokens_per_vbyte: 1,
      is_nested: true,
      network: 'btctestnet',
      private_key: '4af38565a8bb19480057f375400105fcfb3b6534c32fbc1039df496421012b0d',
      sweep_address: 'tb1qxc4zsu4pexvgaacuxxanxt0l76xcjhcd252g4u',
      tokens: 1e4,
      transaction_id: 'bd2eca5cf174d25241ee92df7ab41f1d362e9b1ae6a91ce78886be1c8f31b90c',
      transaction_vout: 0,
      witness_script: '8201208763a914d1a70126ff7a149ca6f9b638db084480440ff8428821000000000000000000000000000000000000000000000000000000000000000000677503fbfa17b175210280a5a994052abe443adb74851387b389386306c690a94ddf3bfd71234cd2a72b68ac',
    },
    description: 'Refund transaction formed',
    expected: {
      has_sig: true,
      input_id: 'bd2eca5cf174d25241ee92df7ab41f1d362e9b1ae6a91ce78886be1c8f31b90c',
      input_index: 0,
      input_script: '2200206f569f1dcbb18b78883398b66a52c7c50938119ed4567cc3c2e5bb6d7b36c650',
      input_sequence: 0,
      locktime: 1571579,
      out_script: '0014362a2872a1c9988ef71c31bb332dfff68d895f0d',
      out_value: 9837,
      version: 1,
      witness_script: '8201208763a914d1a70126ff7a149ca6f9b638db084480440ff8428821000000000000000000000000000000000000000000000000000000000000000000677503fbfa17b175210280a5a994052abe443adb74851387b389386306c690a94ddf3bfd71234cd2a72b68ac',
      witness_unlock: '',
    },
  },
  {
    args: {
      block_height: 1571579,
      fee_tokens_per_vbyte: 1,
      network: 'btctestnet',
      private_key: '4af38565a8bb19480057f375400105fcfb3b6534c32fbc1039df496421012b0d',
      sweep_address: 'tb1qxc4zsu4pexvgaacuxxanxt0l76xcjhcd252g4u',
      tokens: 1e4,
      transaction_id: 'bd2eca5cf174d25241ee92df7ab41f1d362e9b1ae6a91ce78886be1c8f31b90c',
      transaction_vout: 0,
      witness_script: '8201208763a914d1a70126ff7a149ca6f9b638db084480440ff8428821000000000000000000000000000000000000000000000000000000000000000000677503fbfa17b175210280a5a994052abe443adb74851387b389386306c690a94ddf3bfd71234cd2a72b68ac',
    },
    description: 'Native refund transaction formed',
    expected: {
      has_sig: true,
      input_id: 'bd2eca5cf174d25241ee92df7ab41f1d362e9b1ae6a91ce78886be1c8f31b90c',
      input_index: 0,
      input_script: '',
      input_sequence: 0,
      locktime: 1571579,
      out_script: '0014362a2872a1c9988ef71c31bb332dfff68d895f0d',
      out_value: 9872,
      version: 1,
      witness_script: '8201208763a914d1a70126ff7a149ca6f9b638db084480440ff8428821000000000000000000000000000000000000000000000000000000000000000000677503fbfa17b175210280a5a994052abe443adb74851387b389386306c690a94ddf3bfd71234cd2a72b68ac',
      witness_unlock: '',
    },
  },
  {
    args: {
      block_height: 1571579,
      fee_tokens_per_vbyte: 1,
      is_nested: true,
      network: 'btctestnet',
      sweep_address: 'tb1qxc4zsu4pexvgaacuxxanxt0l76xcjhcd252g4u',
      tokens: 1e4,
      transaction_id: 'bd2eca5cf174d25241ee92df7ab41f1d362e9b1ae6a91ce78886be1c8f31b90c',
      transaction_vout: 0,
      witness_script: '8201208763a914d1a70126ff7a149ca6f9b638db084480440ff8428821000000000000000000000000000000000000000000000000000000000000000000677503fbfa17b175210280a5a994052abe443adb74851387b389386306c690a94ddf3bfd71234cd2a72b68ac',
    },
    description: 'Unsigned refund transaction formed',
    expected: {
      has_sig: false,
      input_id: 'bd2eca5cf174d25241ee92df7ab41f1d362e9b1ae6a91ce78886be1c8f31b90c',
      input_index: 0,
      input_script: '2200206f569f1dcbb18b78883398b66a52c7c50938119ed4567cc3c2e5bb6d7b36c650',
      input_sequence: 0,
      locktime: 1571579,
      out_script: '0014362a2872a1c9988ef71c31bb332dfff68d895f0d',
      out_value: 9837,
      version: 1,
    },
  },
  {
    args: {
      block_height: 1571579,
      fee_tokens_per_vbyte: 1,
      network: 'btctestnet',
      sweep_address: 'tb1qxc4zsu4pexvgaacuxxanxt0l76xcjhcd252g4u',
      tokens: 1e4,
      transaction_id: 'bd2eca5cf174d25241ee92df7ab41f1d362e9b1ae6a91ce78886be1c8f31b90c',
      transaction_vout: 0,
      witness_script: '8201208763a914d1a70126ff7a149ca6f9b638db084480440ff8428821000000000000000000000000000000000000000000000000000000000000000000677503fbfa17b175210280a5a994052abe443adb74851387b389386306c690a94ddf3bfd71234cd2a72b68ac',
    },
    description: 'Unsigned refund transaction formed',
    expected: {
      has_sig: false,
      input_id: 'bd2eca5cf174d25241ee92df7ab41f1d362e9b1ae6a91ce78886be1c8f31b90c',
      input_index: 0,
      input_script: '',
      input_sequence: 0,
      locktime: 1571579,
      out_script: '0014362a2872a1c9988ef71c31bb332dfff68d895f0d',
      out_value: 9872,
      version: 1,
    },
  },
];

tests.forEach(({args, description, error, expected}) => {
  return test(description, async () => {
    args.ecp = (await import('ecpair')).ECPairFactory(tinysecp);

    if (!!error) {
      throws(() => refundTransaction(args), new Error(error), 'Got error');
    } else {
      const {transaction} = refundTransaction(args);

      const tx = componentsOfTransaction({transaction});

      const [input] = tx.inputs;
      const [out] = tx.outputs;

      // Unsigned transactions have no witness
      const [sig, unlock, script] = input.witness || [];

      equal(input.id, expected.input_id, 'Input spends expected tx id');
      equal(input.vout, expected.input_index, 'Input index as expected');
      equal(input.script, expected.input_script, 'Input');
      equal(input.sequence, expected.input_sequence, 'Input sequence');
      equal(out.script, expected.out_script, 'Got out script');
      equal(out.tokens, expected.out_value, 'Output value as expected');
      equal(tx.locktime, expected.locktime, 'Transaction locktime');
      equal(tx.version, expected.version, 'Transaction version as expected');
      equal(!!sig, expected.has_sig, 'Witness signature returned');

      if (!!expected.witness_script) {
        equal(script, expected.witness_script, 'Script');
      }

      if (expected.witness_unlock !== undefined) {
        equal(unlock, expected.witness_unlock, 'Unlock');
      }
    }

    return;
  });
});

const {equal} = require('node:assert').strict;
const test = require('node:test');
const {throws} = require('node:assert').strict;

const {componentsOfTransaction} = require('@alexbosworth/blockchain');
const {verify} = require('tiny-secp256k1');

const {refundTransaction} = require('./../../transactions');

const asScalar = n => Buffer.concat([Buffer.alloc(32), n]).subarray(-32);
const derHeaderLength = 2;
const derValue = n => n.subarray(derHeaderLength, derHeaderLength + n[1]);
const hexAsBuffer = hex => Buffer.from(hex, 'hex');
const refundPrivateKey = '79957dc2091c8b024e14ee7f338869174ae39674342f40cc804cb099145d1d97';
const refundPublicKey = '031cb9fba5d8cbc3dad06185e49de60fac484944c3c12682b604e0261b5375d3bf';
const v1SwapScript = '8201208763a914c792bea2f08a4dcada80a2e848e01f236bd139278821039a52e5049486097409dc92b476a0c72fcc24021d2c7d3bbf91789745041a488a67750327fc17b17521031cb9fba5d8cbc3dad06185e49de60fac484944c3c12682b604e0261b5375d3bf68ac';
const v2SwapScript = '21039a52e5049486097409dc92b476a0c72fcc24021d2c7d3bbf91789745041a488aac6476a914382f1ac022fce4ff91259403111a6ebaf1e4831a88ad0327fc17b16782012088a914c792bea2f08a4dcada80a2e848e01f236bd139278851b268';

const derAsCompact = der => {
  const sequence = derValue(hexAsBuffer(der));

  const r = derValue(sequence);

  // The S integer follows the R integer header and value
  const s = derValue(sequence.subarray(derHeaderLength + r.length));

  return Buffer.concat([asScalar(r), asScalar(s)]);
};

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
  {
    args: {
      block_height: 1571579,
      fee_tokens_per_vbyte: 1.1,
      network: 'btctestnet',
      sweep_address: 'tb1qxc4zsu4pexvgaacuxxanxt0l76xcjhcd252g4u',
      tokens: 1e4,
      transaction_id: 'bd2eca5cf174d25241ee92df7ab41f1d362e9b1ae6a91ce78886be1c8f31b90c',
      transaction_vout: 0,
      witness_script: '8201208763a914d1a70126ff7a149ca6f9b638db084480440ff8428821000000000000000000000000000000000000000000000000000000000000000000677503fbfa17b175210280a5a994052abe443adb74851387b389386306c690a94ddf3bfd71234cd2a72b68ac',
    },
    description: 'Unsigned refund is formed with a fractional fee rate',
    expected: {
      has_sig: false,
      input_id: 'bd2eca5cf174d25241ee92df7ab41f1d362e9b1ae6a91ce78886be1c8f31b90c',
      input_index: 0,
      input_script: '',
      input_sequence: 0,
      locktime: 1571579,
      out_script: '0014362a2872a1c9988ef71c31bb332dfff68d895f0d',
      out_value: 9860,
      version: 1,
    },
  },
  {
    args: {
      block_height: 1571879,
      fee_tokens_per_vbyte: 2,
      network: 'btctestnet',
      private_key: refundPrivateKey,
      sweep_address: 'tb1qxc4zsu4pexvgaacuxxanxt0l76xcjhcd252g4u',
      tokens: 1e5,
      transaction_id: 'bd2eca5cf174d25241ee92df7ab41f1d362e9b1ae6a91ce78886be1c8f31b90c',
      transaction_vout: 1,
      witness_script: v1SwapScript,
    },
    description: 'Signed v1 refund transaction formed',
    expected: {
      has_sig: true,
      input_id: 'bd2eca5cf174d25241ee92df7ab41f1d362e9b1ae6a91ce78886be1c8f31b90c',
      input_index: 1,
      input_script: '',
      input_sequence: 0,
      locktime: 1571879,
      out_script: '0014362a2872a1c9988ef71c31bb332dfff68d895f0d',
      out_value: 99744,
      sighash: '4c01b83c8291112ba402cc4986fbb37969257f6599c432b6b420159de672a536',
      transaction: '010000000001010cb9318f1cbe8688e71ca9e61a9b2e361d1fb47adf92ee4152d274f15cca2ebd01000000000000000001a085010000000000160014362a2872a1c9988ef71c31bb332dfff68d895f0d034730440220173d01487c47a50fd0a5bf0c2e1c7dbe722c0fc446ae565478d4ea0d4f84f3be02202bc59cd84a84e29385ccc923dcedd5991b66095e7c140245bfb01cde507099d401006a8201208763a914c792bea2f08a4dcada80a2e848e01f236bd139278821039a52e5049486097409dc92b476a0c72fcc24021d2c7d3bbf91789745041a488a67750327fc17b17521031cb9fba5d8cbc3dad06185e49de60fac484944c3c12682b604e0261b5375d3bf68ac27fc1700',
      version: 1,
      witness_script: v1SwapScript,
      witness_unlock: '',
    },
  },
  {
    args: {
      block_height: 1571879,
      fee_tokens_per_vbyte: 2,
      is_nested: true,
      network: 'btctestnet',
      private_key: refundPrivateKey,
      sweep_address: 'tb1qxc4zsu4pexvgaacuxxanxt0l76xcjhcd252g4u',
      tokens: 1e5,
      transaction_id: 'bd2eca5cf174d25241ee92df7ab41f1d362e9b1ae6a91ce78886be1c8f31b90c',
      transaction_vout: 1,
      witness_script: v1SwapScript,
    },
    description: 'Signed nested v1 refund transaction formed',
    expected: {
      has_sig: true,
      input_id: 'bd2eca5cf174d25241ee92df7ab41f1d362e9b1ae6a91ce78886be1c8f31b90c',
      input_index: 1,
      input_script: '2200207de5f9048cc34776b39f5f3b41c93d5c1b4063a53182bf6e174200cfff50306d',
      input_sequence: 0,
      locktime: 1571879,
      out_script: '0014362a2872a1c9988ef71c31bb332dfff68d895f0d',
      out_value: 99674,
      sighash: '923dd4cbd5f7b369b3975fd259ee2fd933430068fae8dd48695bdf96ffd74cf8',
      transaction: '010000000001010cb9318f1cbe8688e71ca9e61a9b2e361d1fb47adf92ee4152d274f15cca2ebd01000000232200207de5f9048cc34776b39f5f3b41c93d5c1b4063a53182bf6e174200cfff50306d00000000015a85010000000000160014362a2872a1c9988ef71c31bb332dfff68d895f0d03483045022100a7e5528a63f78982d4b9b25c5afb1774b67593380b5444878f5d4e7ec01d7c3302200ebeb96650901928301534f019793f3d21c410aaa92a6319932eab2180ad89ef01006a8201208763a914c792bea2f08a4dcada80a2e848e01f236bd139278821039a52e5049486097409dc92b476a0c72fcc24021d2c7d3bbf91789745041a488a67750327fc17b17521031cb9fba5d8cbc3dad06185e49de60fac484944c3c12682b604e0261b5375d3bf68ac27fc1700',
      version: 1,
      witness_script: v1SwapScript,
      witness_unlock: '',
    },
  },
  {
    args: {
      block_height: 1571879,
      fee_tokens_per_vbyte: 2,
      network: 'btctestnet',
      private_key: refundPrivateKey,
      sweep_address: 'tb1qxc4zsu4pexvgaacuxxanxt0l76xcjhcd252g4u',
      tokens: 1e5,
      transaction_id: 'bd2eca5cf174d25241ee92df7ab41f1d362e9b1ae6a91ce78886be1c8f31b90c',
      transaction_vout: 1,
      witness_script: v2SwapScript,
    },
    description: 'Signed v2 refund transaction formed',
    expected: {
      has_sig: true,
      input_id: 'bd2eca5cf174d25241ee92df7ab41f1d362e9b1ae6a91ce78886be1c8f31b90c',
      input_index: 1,
      input_script: '',
      input_sequence: 0,
      locktime: 1571879,
      out_script: '0014362a2872a1c9988ef71c31bb332dfff68d895f0d',
      out_value: 99730,
      sighash: '57686710f06ed6fa9d888a70483c073e1146d3b2b44d220bcea1e1baa8352395',
      transaction: '010000000001010cb9318f1cbe8688e71ca9e61a9b2e361d1fb47adf92ee4152d274f15cca2ebd010000000000000000019285010000000000160014362a2872a1c9988ef71c31bb332dfff68d895f0d044830450221009d78fb2cad2eb7e962b0a246ba3a15108156fad624acf59dede7ba0db8986278022071f66e691d52947e766c05af698c697f7f2a057c1f2342f1a82c9fc319eb7f850121031cb9fba5d8cbc3dad06185e49de60fac484944c3c12682b604e0261b5375d3bf006121039a52e5049486097409dc92b476a0c72fcc24021d2c7d3bbf91789745041a488aac6476a914382f1ac022fce4ff91259403111a6ebaf1e4831a88ad0327fc17b16782012088a914c792bea2f08a4dcada80a2e848e01f236bd139278851b26827fc1700',
      version: 1,
    },
  },
  {
    args: {
      block_height: 1571879,
      fee_tokens_per_vbyte: 2,
      is_nested: true,
      network: 'btctestnet',
      private_key: refundPrivateKey,
      sweep_address: 'tb1qxc4zsu4pexvgaacuxxanxt0l76xcjhcd252g4u',
      tokens: 1e5,
      transaction_id: 'bd2eca5cf174d25241ee92df7ab41f1d362e9b1ae6a91ce78886be1c8f31b90c',
      transaction_vout: 1,
      witness_script: v2SwapScript,
    },
    description: 'Signed nested v2 refund transaction formed',
    expected: {
      has_sig: true,
      input_id: 'bd2eca5cf174d25241ee92df7ab41f1d362e9b1ae6a91ce78886be1c8f31b90c',
      input_index: 1,
      input_script: '22002032940b50f8019d4e9ec51faf2dfdc901301223060949a935ce4a986abd2f2cc7',
      input_sequence: 0,
      locktime: 1571879,
      out_script: '0014362a2872a1c9988ef71c31bb332dfff68d895f0d',
      out_value: 99660,
      sighash: '9abbcd66145070bd0d5f3444e73152c91f5fb4c22f9c5e05c1c917edd1d57085',
      transaction: '010000000001010cb9318f1cbe8688e71ca9e61a9b2e361d1fb47adf92ee4152d274f15cca2ebd010000002322002032940b50f8019d4e9ec51faf2dfdc901301223060949a935ce4a986abd2f2cc700000000014c85010000000000160014362a2872a1c9988ef71c31bb332dfff68d895f0d0447304402201cfd6b48fc85fb9076f50716810a18c3565def14ffb73fa484035d8d67e219100220776a25f4d114ea7f5fe49716394b8360a557bc1d33c393aef90d694d1f3b8de00121031cb9fba5d8cbc3dad06185e49de60fac484944c3c12682b604e0261b5375d3bf006121039a52e5049486097409dc92b476a0c72fcc24021d2c7d3bbf91789745041a488aac6476a914382f1ac022fce4ff91259403111a6ebaf1e4831a88ad0327fc17b16782012088a914c792bea2f08a4dcada80a2e848e01f236bd139278851b26827fc1700',
      version: 1,
    },
  },
];

tests.forEach(({args, description, error, expected}) => {
  return test(description, async () => {
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

      // Exit early when there is no signature to check
      if (!expected.sighash) {
        return;
      }

      const isValid = verify(
        hexAsBuffer(expected.sighash),
        hexAsBuffer(refundPublicKey),
        derAsCompact(sig)
      );

      equal(transaction, expected.transaction, 'Got expected transaction');
      equal(isValid, true, 'Signature is valid for the hash to sign');
      equal(sig.slice(-2), '01', 'Signature has the sighash all flag');
    }

    return;
  });
});

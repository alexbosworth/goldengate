const {ECPair} = require('bitcoinjs-lib');
const {test} = require('tap');
const {Transaction} = require('bitcoinjs-lib');

const {refundTransaction} = require('./../../transactions');

const tests = [
  {
    args: {
      block_height: 1571579,
      fee_tokens_per_vbyte: 1,
      network: 'btctestnet',
      private_key: ECPair.makeRandom().privateKey.toString('hex'),
      sweep_address: 'tb1qxc4zsu4pexvgaacuxxanxt0l76xcjhcd252g4u',
      tokens: 1e4,
      transaction_id: 'bd2eca5cf174d25241ee92df7ab41f1d362e9b1ae6a91ce78886be1c8f31b90c',
      transaction_vout: 0,
      witness_script: '8201208763a914d1a70126ff7a149ca6f9b638db084480440ff8428821000000000000000000000000000000000000000000000000000000000000000000677503fbfa17b175210280a5a994052abe443adb74851387b389386306c690a94ddf3bfd71234cd2a72b68ac',
    },
    description: 'Refund transaction formed',
    expected: {
      input_hash: '0cb9318f1cbe8688e71ca9e61a9b2e361d1fb47adf92ee4152d274f15cca2ebd',
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
];

tests.forEach(({args, description, expected}) => {
  return test(description, ({equal, end}) => {
    const tx = Transaction.fromHex(refundTransaction(args).transaction);

    const [input] = tx.ins;
    const [out] = tx.outs;

    const [witnessSig, witnessUnlock, witnessScript] = input.witness;

    equal(input.hash.toString('hex'), expected.input_hash, 'Input hash');
    equal(input.index, expected.input_index, 'Input index as expected');
    equal(input.script.toString('hex'), expected.input_script, 'Input script');
    equal(input.sequence, expected.input_sequence, 'Input sequence expected');
    equal(out.script.toString('hex'), expected.out_script, 'Got out script');
    equal(out.value, expected.out_value, 'Output value as expected');
    equal(tx.locktime, expected.locktime, 'Transaction locktime as expected');
    equal(tx.version, expected.version, 'Transaction version as expected');
    equal(!!witnessSig, true, 'Witness signature returned');
    equal(witnessUnlock.toString('hex'), expected.witness_unlock, 'Unlock');
    equal(witnessScript.toString('hex'), expected.witness_script, 'Script');

    return end();
  });
});

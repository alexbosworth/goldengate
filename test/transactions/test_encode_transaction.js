const {equal} = require('node:assert').strict;
const test = require('node:test');
const {throws} = require('node:assert').strict;

const {componentsOfTransaction} = require('@alexbosworth/blockchain');
const {idForTransaction} = require('@alexbosworth/blockchain');

const method = require('./../../transactions/encode_transaction');

const makeArgs = overrides => {
  const args = {
    inputs: [{
      id: 'bd2eca5cf174d25241ee92df7ab41f1d362e9b1ae6a91ce78886be1c8f31b90c',
      script: '',
      sequence: 1,
      vout: 0,
    }],
    locktime: 1571579,
    outputs: [{
      script: '0014362a2872a1c9988ef71c31bb332dfff68d895f0d',
      tokens: 9864,
    }],
    version: 2,
  };

  Object.keys(overrides).forEach(k => args[k] = overrides[k]);

  return args;
};

const makeInputs = overrides => {
  const [input] = makeArgs({}).inputs;

  Object.keys(overrides).forEach(k => input[k] = overrides[k]);

  return [input];
};

const makeOutputs = overrides => {
  const [output] = makeArgs({}).outputs;

  Object.keys(overrides).forEach(k => output[k] = overrides[k]);

  return [output];
};

const tests = [
  {
    args: makeArgs({}),
    description: 'A transaction is encoded',
    expected: {
      id: '05655da2725bbb2a9f3e512f897cae944024124a1ee243b010c8be5b8c6afc21',
      transaction: '02000000010cb9318f1cbe8688e71ca9e61a9b2e361d1fb47adf92ee4152d274f15cca2ebd000000000001000000018826000000000000160014362a2872a1c9988ef71c31bb332dfff68d895f0dfbfa1700',
    },
  },
  {
    args: makeArgs({
      inputs: makeInputs({
        witness: [
          '00',
          'bdb8e03b149a48e3c706663b8cee7c7590bee386d5d8b5620fd504c848437e6e',
        ],
      }),
    }),
    description: 'A transaction with a witness is encoded',
    expected: {
      id: '05655da2725bbb2a9f3e512f897cae944024124a1ee243b010c8be5b8c6afc21',
      transaction: '020000000001010cb9318f1cbe8688e71ca9e61a9b2e361d1fb47adf92ee4152d274f15cca2ebd000000000001000000018826000000000000160014362a2872a1c9988ef71c31bb332dfff68d895f0d02010020bdb8e03b149a48e3c706663b8cee7c7590bee386d5d8b5620fd504c848437e6efbfa1700',
    },
  },
  {
    args: makeArgs({inputs: undefined}),
    description: 'Inputs are expected',
    error: 'ExpectedArrayOfInputsToEncodeTransaction',
  },
  {
    args: makeArgs({inputs: [null]}),
    description: 'Input details are expected',
    error: 'ExpectedSequenceNumberForEachInputToEncodeTransaction',
  },
  {
    args: makeArgs({inputs: makeInputs({sequence: undefined})}),
    description: 'An input sequence is expected',
    error: 'ExpectedSequenceNumberForEachInputToEncodeTransaction',
  },
  {
    args: makeArgs({inputs: makeInputs({sequence: 1.5})}),
    description: 'A whole number input sequence is expected',
    error: 'ExpectedSequenceNumberForEachInputToEncodeTransaction',
  },
  {
    args: makeArgs({inputs: makeInputs({sequence: 0x100000000})}),
    description: 'A 32 bit input sequence is expected',
    error: 'ExpectedSequenceNumberForEachInputToEncodeTransaction',
  },
  {
    args: makeArgs({inputs: makeInputs({vout: undefined})}),
    description: 'An input output index is expected',
    error: 'ExpectedOutputIndexForEachInputToEncodeTransaction',
  },
  {
    args: makeArgs({inputs: makeInputs({vout: null})}),
    description: 'A non null input output index is expected',
    error: 'ExpectedOutputIndexForEachInputToEncodeTransaction',
  },
  {
    args: makeArgs({inputs: makeInputs({vout: '1'})}),
    description: 'A number input output index is expected',
    error: 'ExpectedOutputIndexForEachInputToEncodeTransaction',
  },
  {
    args: makeArgs({inputs: makeInputs({vout: 1.5})}),
    description: 'A whole number input output index is expected',
    error: 'ExpectedOutputIndexForEachInputToEncodeTransaction',
  },
  {
    args: makeArgs({inputs: makeInputs({vout: -1})}),
    description: 'A positive input output index is expected',
    error: 'ExpectedOutputIndexForEachInputToEncodeTransaction',
  },
  {
    args: makeArgs({locktime: undefined}),
    description: 'A locktime is expected',
    error: 'ExpectedLocktimeNumberToEncodeTransaction',
  },
  {
    args: makeArgs({locktime: 1571579.5}),
    description: 'A whole number locktime is expected',
    error: 'ExpectedLocktimeNumberToEncodeTransaction',
  },
  {
    args: makeArgs({locktime: -1}),
    description: 'A positive locktime is expected',
    error: 'ExpectedLocktimeNumberToEncodeTransaction',
  },
  {
    args: makeArgs({outputs: undefined}),
    description: 'Outputs are expected',
    error: 'ExpectedArrayOfOutputsToEncodeTransaction',
  },
  {
    args: makeArgs({outputs: [null]}),
    description: 'Output details are expected',
    error: 'ExpectedValidTokensForEachOutputToEncodeTransaction',
  },
  {
    args: makeArgs({outputs: makeOutputs({tokens: 9864.5})}),
    description: 'Whole number output tokens are expected',
    error: 'ExpectedValidTokensForEachOutputToEncodeTransaction',
  },
  {
    args: makeArgs({outputs: makeOutputs({tokens: -1})}),
    description: 'Positive output tokens are expected',
    error: 'ExpectedValidTokensForEachOutputToEncodeTransaction',
  },
  {
    args: makeArgs({outputs: makeOutputs({tokens: 21e14 + 1})}),
    description: 'Output tokens are not more than can exist',
    error: 'ExpectedValidTokensForEachOutputToEncodeTransaction',
  },
  {
    args: makeArgs({version: undefined}),
    description: 'A version is expected',
    error: 'ExpectedVersionNumberToEncodeTransaction',
  },
  {
    args: makeArgs({version: 0x80000000}),
    description: 'A 32 bit signed version is expected',
    error: 'ExpectedVersionNumberToEncodeTransaction',
  },
  {
    args: makeArgs({inputs: makeInputs({id: 'bd2eca'})}),
    description: 'A transaction id is expected for inputs',
    error: 'ExpectedSpendingTransactionIdsToFormTransaction',
  },
];

tests.forEach(({args, description, error, expected}) => {
  return test(description, (t, end) => {
    if (!!error) {
      throws(() => method(args), new Error(error), 'Got expected error');

      return end();
    }

    const {transaction} = method(args);

    const tx = componentsOfTransaction({transaction});

    equal(transaction, expected.transaction, 'Got expected transaction');
    equal(idForTransaction({transaction}).id, expected.id, 'Got tx id');
    equal(tx.inputs.length, args.inputs.length, 'Got expected inputs');
    equal(tx.locktime, args.locktime, 'Got expected locktime');
    equal(tx.version, args.version, 'Got expected version');

    return end();
  });
});

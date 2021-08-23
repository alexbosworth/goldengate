const {ECPair} = require('bitcoinjs-lib');
const {test} = require('@alexbosworth/tap');

const claimOutputs = require('./../../transactions/claim_outputs');
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
    script,
    address: 'tb1qxc4zsu4pexvgaacuxxanxt0l76xcjhcd252g4u',
    network: 'btctestnet',
    rate: 1.253,
    sends: [{
      address: 'tb1qxc4zsu4pexvgaacuxxanxt0l76xcjhcd252g4u',
      tokens: 12345,
    }],
    tokens: 1e6,
  };

  Object.keys(overrides).forEach(key => args[key] = overrides[key]);

  return args;
};

const makeExpected = ({}) => {
  return {
    outputs: [
      {
        address: 'tb1qxc4zsu4pexvgaacuxxanxt0l76xcjhcd252g4u',
        tokens: 987446,
      },
      {
        address: 'tb1qxc4zsu4pexvgaacuxxanxt0l76xcjhcd252g4u',
        tokens: 12345,
      },
    ],
  };
};

const tests = [
  {
    args: makeArgs({address: undefined}),
    description: 'An address is required',
    error: 'ExpectedSweepAddressToCalculateClaimOutputs',
  },
  {
    args: makeArgs({address: 'address'}),
    description: 'A valid address is required',
    error: 'FailedToAddSweepAddressOutputScriptCalculatingOutputs',
  },
  {
    args: makeArgs({network: undefined}),
    description: 'A network name is required',
    error: 'ExpectedNetworkNameToCalculateClaimOutputs',
  },
  {
    args: makeArgs({rate: undefined}),
    description: 'A rate is required',
    error: 'ExpectedFeeRateToCalculateClaimOutputs',
  },
  {
    args: makeArgs({sends: undefined}),
    description: 'An array of sends is required',
    error: 'ExpectedArrayOfSendsToCalculateClaimOutputs',
  },
  {
    args: makeArgs({sends: [undefined]}),
    description: 'An array of send outputs is required',
    error: 'ExpectedOutputsToCalculateClaimOutputs',
  },
  {
    args: makeArgs({sends: [{}]}),
    description: 'Send addresses are required',
    error: 'ExpectedAddressInSendsArrayToCalculateClaimOutputs',
  },
  {
    args: makeArgs({sends: [{address: 'address'}]}),
    description: 'Send tokens are required',
    error: 'ExpectedTokensInSendsArrayToCalculateClaimOutputs',
  },
  {
    args: makeArgs({tokens: undefined}),
    description: 'Sweep tokens are required',
    error: 'ExpectedTokensToCalculateClaimOutputs',
  },
  {
    args: makeArgs({rate: 99999}),
    description: 'A large fee rate is clamped to a small value output',
    expected: {
      outputs: [{
        address: 'tb1qxc4zsu4pexvgaacuxxanxt0l76xcjhcd252g4u',
        tokens: 1092,
      }],
    },
  },
  {
    args: makeArgs({sends: []}),
    description: 'No sends just returns a single output',
    expected: {
      outputs: [{
        address: 'tb1qxc4zsu4pexvgaacuxxanxt0l76xcjhcd252g4u',
        tokens: 999830,
      }],
    },
  },
  {
    args: makeArgs({
      sends: [{
        address: 'tb1qxc4zsu4pexvgaacuxxanxt0l76xcjhcd252g4u',
        tokens: 1,
      }],
    }),
    description: 'A dust output is ignored',
    expected: {
      outputs: [{
        address: 'tb1qxc4zsu4pexvgaacuxxanxt0l76xcjhcd252g4u',
        tokens: 999830,
      }],
    },
  },
  {
    args: makeArgs({
      sends: [{
        address: 'tb1qxc4zsu4pexvgaacuxxanxt0l76xcjhcd252g4u',
        tokens: 999730,
      }],
    }),
    description: 'A too-large output is ignored',
    expected: {
      outputs: [{
        address: 'tb1qxc4zsu4pexvgaacuxxanxt0l76xcjhcd252g4u',
        tokens: 999830,
      }],
    },
  },
  {
    args: makeArgs({sends: [{address: 'address', tokens: 1e5}]}),
    description: 'An invalid address is ignored',
    expected: {
      outputs: [{
        address: 'tb1qxc4zsu4pexvgaacuxxanxt0l76xcjhcd252g4u',
        tokens: 999830,
      }],
    },
  },
  {
    args: makeArgs({}),
    description: 'Calculate outputs when sends are specified',
    expected: makeExpected({}),
  },
];

tests.forEach(({args, description, error, expected}) => {
  return test(description, ({end, throws, strictSame}) => {
    if (!!error) {
      throws(() => claimOutputs(args), new Error(error), 'Got error');
    } else {
      strictSame(claimOutputs(args), expected, 'Got expected outputs');
    }

    return end();
  });
});

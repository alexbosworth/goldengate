const {deepEqual} = require('node:assert').strict;
const test = require('node:test');
const {throws} = require('node:assert').strict;

const fixtures = require('./fixtures');
const method = require('./../../taproot/taproot_claim_outputs');

const sendAddress = 'tb1qsmd28ztyvef6f4z86tpfahh2q6vl039lvt3t9m5luk7mdmpphq4sf3spnr';

const makeArgs = overrides => {
  const args = {
    address: fixtures.sweep_address,
    control: '00'.repeat(65),
    network: 'btctestnet',
    rate: 3,
    script: fixtures.claim_script,
    sends: [],
    tokens: 5e5,
  };

  Object.keys(overrides).forEach(k => args[k] = overrides[k]);

  return args;
};

const tests = [
  {
    args: makeArgs({}),
    description: 'Claim outputs pay for a claim path spend',
    expected: {
      outputs: [{
        script: '0014362a2872a1c9988ef71c31bb332dfff68d895f0d',
        tokens: 499580,
      }],
    },
  },
  {
    args: makeArgs({control: undefined, script: undefined}),
    description: 'Claim outputs pay for a key path spend',
    expected: {
      outputs: [{
        script: '0014362a2872a1c9988ef71c31bb332dfff68d895f0d',
        tokens: 499703,
      }],
    },
  },
  {
    args: makeArgs({sends: [{address: sendAddress, tokens: 1e5}]}),
    description: 'Claim outputs include sends',
    expected: {
      outputs: [
        {
          script: '0014362a2872a1c9988ef71c31bb332dfff68d895f0d',
          tokens: 399451,
        },
        {
          script: '002086daa389646653a4d447d2c29edeea0699f7c4bf62e2b2ee9fe5bdb6ec21b82b',
          tokens: 1e5,
        },
      ],
    },
  },
  {
    args: makeArgs({
      control: undefined,
      script: undefined,
      sends: [
        {address: sendAddress, tokens: 1e5},
        {address: sendAddress, tokens: 546},
        {address: 'bc1qxc4zsu4pexvgaacuxxanxt0l76xcjhcdqj3mw0', tokens: 1e5},
      ],
    }),
    description: 'Dust sends and sends to other chains are left out',
    expected: {
      outputs: [
        {
          script: '0014362a2872a1c9988ef71c31bb332dfff68d895f0d',
          tokens: 399574,
        },
        {
          script: '002086daa389646653a4d447d2c29edeea0699f7c4bf62e2b2ee9fe5bdb6ec21b82b',
          tokens: 1e5,
        },
      ],
    },
  },
  {
    args: makeArgs({
      control: undefined,
      script: undefined,
      sends: [
        {address: sendAddress, tokens: 499400},
        {address: sendAddress, tokens: 100},
      ],
    }),
    description: 'Sends are left out when they would make the sweep dust',
    expected: {
      outputs: [{
        script: '0014362a2872a1c9988ef71c31bb332dfff68d895f0d',
        tokens: 499703,
      }],
    },
  },
  {
    args: makeArgs({address: undefined}),
    description: 'A sweep address is expected',
    error: 'ExpectedSweepAddressToCalculateTaprootClaimOutputs',
  },
  {
    args: makeArgs({network: undefined}),
    description: 'A network is expected',
    error: 'ExpectedNetworkNameToCalculateTaprootClaimOutputs',
  },
  {
    args: makeArgs({rate: undefined}),
    description: 'A fee rate is expected',
    error: 'ExpectedFeeRateToCalculateTaprootClaimOutputs',
  },
  {
    args: makeArgs({sends: undefined}),
    description: 'Sends are expected',
    error: 'ExpectedArrayOfSendsToCalculateTaprootClaimOutputs',
  },
  {
    args: makeArgs({sends: [null]}),
    description: 'Send details are expected',
    error: 'ExpectedOutputsToCalculateTaprootClaimOutputs',
  },
  {
    args: makeArgs({sends: [{tokens: 1e5}]}),
    description: 'A send address is expected',
    error: 'ExpectedAddressInSendsToCalculateTaprootClaimOutputs',
  },
  {
    args: makeArgs({sends: [{address: sendAddress}]}),
    description: 'Send tokens are expected',
    error: 'ExpectedTokensInSendsToCalculateTaprootClaimOutputs',
  },
  {
    args: makeArgs({tokens: undefined}),
    description: 'Tokens are expected',
    error: 'ExpectedTokensToCalculateTaprootClaimOutputs',
  },
  {
    args: makeArgs({tokens: -1}),
    description: 'Valid tokens are expected',
    error: 'FailedToAddSweepAddressOutputCalculatingTaprootOutputs',
  },
  {
    args: makeArgs({tokens: 1.5}),
    description: 'Whole tokens are expected',
    error: 'FailedToAddSweepAddressOutputCalculatingTaprootOutputs',
  },
  {
    args: makeArgs({network: 'btc'}),
    description: 'A sweep address for the network is expected',
    error: 'FailedToAddSweepAddressOutputCalculatingTaprootOutputs',
  },
];

tests.forEach(({args, description, error, expected}) => {
  return test(description, (t, end) => {
    if (!!error) {
      throws(() => method(args), new Error(error), 'Got expected error');
    } else {
      deepEqual(method(args), expected, 'Got expected outputs');
    }

    return end();
  });
});

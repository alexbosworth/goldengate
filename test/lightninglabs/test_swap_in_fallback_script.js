const {deepEqual} = require('node:assert').strict;
const test = require('node:test');

const {addressForScript} = require('./../../script');
const method = require('./../../lightninglabs/swap_in_fallback_script');
const {swapScriptV2} = require('./../../script');

const clientKey = '031b84c5567b126440995d3ed5aaba0565d71e1834604819ff9c17f5e9d5dd078f';
const id = Buffer.alloc(32, 9).toString('hex');
const serverKey = '024d4b6cd1361032ca9bd2aeb9d900aa4d45d9ead80ac9423374c451a7254d0766';

const {script} = swapScriptV2({
  claim_public_key: serverKey,
  hash: id,
  refund_public_key: clientKey,
  timeout: 900,
});

const {address} = addressForScript({script, network: 'btc'});

const makeArgs = overrides => {
  const args = {
    claim_public_key: serverKey,
    hash: id,
    network: 'btc',
    refund_public_key: clientKey,
    timeout: 900,
  };

  Object.keys(overrides).forEach(k => args[k] = overrides[k]);

  return args;
};

const tests = [
  {
    args: makeArgs({network: 'network'}),
    description: 'A failure to derive the HTLC returns the error',
    expected: {err: new Error('ExpectedKnownNetworkToDeriveAddress')},
  },
  {
    args: makeArgs({}),
    description: 'The swap HTLC script and address are derived',
    expected: {address, script},
  },
];

tests.forEach(({args, description, expected}) => {
  return test(description, (t, end) => {
    deepEqual(method(args), expected, 'Got expected HTLC');

    return end();
  });
});

const {deepEqual} = require('node:assert').strict;
const test = require('node:test');

const {makeLnd} = require('mock-lnd');
const {makeRpcError} = require('mock-lnd');

const method = require('./../../lightninglabs/begin_spend_session');
const {sharedAddressScript} = require('./../../');

const clientKey = '031b84c5567b126440995d3ed5aaba0565d71e1834604819ff9c17f5e9d5dd078f';
const clientSecret = Buffer.alloc(32, 1).toString('hex');
const serviceKey = '024d4b6cd1361032ca9bd2aeb9d900aa4d45d9ead80ac9423374c451a7254d0766';

const address = sharedAddressScript({
  client_public_key: clientKey,
  expiry: 14400,
  network: 'btc',
  server_public_key: serviceKey,
});

// A fake LND with the client key of the shared address
const clientLnd = args => makeLnd({
  failures: args.failures,
  keys: [{family: 42060, index: 7, secret: clientSecret}],
});

const makeArgs = overrides => {
  const args = {
    key_family: 42060,
    key_index: 7,
    lnd: clientLnd({}),
    output_script: address.output_script,
    root_hash: address.root_hash,
    service_public_key: serviceKey,
  };

  Object.keys(overrides).forEach(k => args[k] = overrides[k]);

  return args;
};

// The sessions that a fake LND started, in the order they were started
const startedSessions = ({calls}) => calls
  .filter(n => n.method === 'muSig2CreateSession' && !!n.response)
  .map(n => n.response);

// The ids and nonces of the sessions that a fake LND started
const startedIds = lnd => startedSessions(lnd).map(n => ({
  id: n.session_id.toString('hex'),
  nonce: n.local_public_nonces.toString('hex'),
}));

// Begin a session and get the sessions that are tracked for clean up
const sessionsFrom = async args => {
  const sessions = [];

  // Tracked sessions are the indexes of the sessions that LND started
  const tracked = () => {
    const started = startedIds(args.lnd).map(n => `${n.id}:${n.nonce}`);

    return sessions.map(n => started.indexOf(`${n.id}:${n.nonce}`));
  };

  try {
    await method({...args, sessions});
  } catch (err) {
    return {err, sessions: tracked()};
  }

  return {sessions: tracked()};
};

const tests = [
  {
    args: makeArgs({
      lnd: clientLnd({
        failures: [{
          details: 'err',
          method: 'muSig2CreateSession',
          type: 'signer',
        }],
      }),
    }),
    description: 'A session that cannot be started is not tracked',
    expected: {
      err: [
        503,
        'UnexpectedErrorCreatingMuSig2Session',
        {err: makeRpcError({details: 'err'})},
      ],
      sessions: [],
    },
  },
  {
    args: makeArgs({root_hash: Buffer.alloc(32, 9).toString('hex')}),
    description: 'A session key that is not the address key is tracked',
    expected: {
      err: [503, 'UnexpectedSessionKeyForSharedAddress'],
      sessions: [0],
    },
  },
  {
    args: makeArgs({}),
    description: 'A shared address session is started and tracked',
    expected: {sessions: [0]},
  },
];

tests.forEach(({args, description, expected}) => {
  return test(description, async () => {
    deepEqual(await sessionsFrom(args), expected, 'Got expected sessions');

    return;
  });
});

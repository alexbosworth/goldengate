const {deepEqual} = require('node:assert').strict;
const test = require('node:test');

const method = require('./../../lightninglabs/begin_spend_session');
const {sharedAddressScript} = require('./../../');

const bufferAsHex = buffer => Buffer.from(buffer).toString('hex');
const clientKey = '031b84c5567b126440995d3ed5aaba0565d71e1834604819ff9c17f5e9d5dd078f';
const hexAsBuffer = hex => Buffer.from(hex, 'hex');
const serviceKey = '024d4b6cd1361032ca9bd2aeb9d900aa4d45d9ead80ac9423374c451a7254d0766';

const address = sharedAddressScript({
  client_public_key: clientKey,
  expiry: 14400,
  network: 'btc',
  server_public_key: serviceKey,
});

const makeLnd = ({err, sessionKey}) => {
  return {
    signer: {
      muSig2CreateSession: ({}, cbk) => {
        if (!!err) {
          return cbk(err);
        }

        const combinedKey = sessionKey || address.output_script.slice(4);

        return cbk(null, {
          combined_key: hexAsBuffer(combinedKey),
          local_public_nonces: Buffer.alloc(66, 1),
          session_id: Buffer.alloc(32, 1),
          taproot_internal_key: hexAsBuffer(address.internal_key),
        });
      },
    },
    wallet: {
      deriveKey: ({}, cbk) => cbk(null, {
        key_loc: {key_index: 7},
        raw_key_bytes: hexAsBuffer(clientKey),
      }),
    },
  };
};

const makeArgs = overrides => {
  const args = {
    key_family: 42060,
    key_index: 7,
    lnd: makeLnd({}),
    output_script: address.output_script,
    root_hash: address.root_hash,
    service_public_key: serviceKey,
  };

  Object.keys(overrides).forEach(k => args[k] = overrides[k]);

  return args;
};

const session = {
  id: bufferAsHex(Buffer.alloc(32, 1)),
  nonce: bufferAsHex(Buffer.alloc(66, 1)),
};

// Begin a session and get the sessions that are tracked for clean up
const sessionsFrom = async args => {
  const sessions = [];

  try {
    await method({...args, sessions});
  } catch (err) {
    return {err, sessions};
  }

  return {sessions};
};

const tests = [
  {
    args: makeArgs({lnd: makeLnd({err: 'err'})}),
    description: 'A session that cannot be started is not tracked',
    expected: {
      err: [503, 'UnexpectedErrorCreatingMuSig2Session', {err: 'err'}],
      sessions: [],
    },
  },
  {
    args: makeArgs({lnd: makeLnd({sessionKey: address.internal_key})}),
    description: 'A session key that is not the address key is tracked',
    expected: {
      err: [503, 'UnexpectedSessionKeyForSharedAddress'],
      sessions: [session],
    },
  },
  {
    args: makeArgs({}),
    description: 'A shared address session is started and tracked',
    expected: {sessions: [session]},
  },
];

tests.forEach(({args, description, expected}) => {
  return test(description, async () => {
    deepEqual(await sessionsFrom(args), expected, 'Got expected sessions');

    return;
  });
});

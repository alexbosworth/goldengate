const {deepEqual} = require('node:assert').strict;
const test = require('node:test');

const {beginGroupSigningSession} = require('ln-service');
const {makeLnd} = require('mock-lnd');

const method = require('./../../lightninglabs/end_spend_sessions');

const bufferAsHex = buffer => Buffer.from(buffer).toString('hex');
const idFor = n => Buffer.alloc(32, n).toString('hex');
const serviceKey = '024d4b6cd1361032ca9bd2aeb9d900aa4d45d9ead80ac9423374c451a7254d0766';

// Start a session with a fake LND, and get the id of the session
const startSession = async ({lnd}) => {
  const {id} = await beginGroupSigningSession({
    lnd,
    is_key_spend: true,
    key_family: 6,
    key_index: 0,
    public_keys: [serviceKey],
  });

  return id;
};

// End sessions, and get the sessions LND is asked to end and if they ended
const endedWith = async ({is_started, sessions}) => {
  const lnd = makeLnd({});

  const started = !is_started ? [] : [{id: await startSession({lnd})}];

  await method({lnd, sessions: started.concat(sessions)});

  const cleaned = lnd.calls.filter(n => n.method === 'muSig2Cleanup');

  // A started session is named as started instead of by its id
  return cleaned.map(call => {
    const id = bufferAsHex(call.args.session_id);

    const isStarted = !!started.length && id === started[0].id;

    return [isStarted ? 'started' : id, !call.err];
  });
};

const tests = [
  {
    args: {sessions: []},
    description: 'There is nothing to do without sessions',
    expected: [],
  },
  {
    args: {sessions: [{id: idFor(1)}, {id: idFor(2)}]},
    description: 'A failure to end a session is not an error',
    expected: [[idFor(1), false], [idFor(2), false]],
  },
  {
    args: {
      sessions: [
        {id: idFor(1)},
        {id: idFor(2), is_ended: true},
        {id: idFor(3)},
      ],
    },
    description: 'Sessions that are not ended yet are ended',
    expected: [[idFor(1), false], [idFor(3), false]],
  },
  {
    args: {is_started: true, sessions: []},
    description: 'A started session is ended',
    expected: [['started', true]],
  },
];

tests.forEach(({args, description, expected}) => {
  return test(description, async () => {
    deepEqual(await endedWith(args), expected, 'Got expected ended sessions');

    return;
  });
});

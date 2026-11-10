const {deepEqual} = require('node:assert').strict;
const test = require('node:test');

const method = require('./../../lightninglabs/end_spend_sessions');

const bufferAsHex = buffer => Buffer.from(buffer).toString('hex');
const idFor = n => Buffer.alloc(32, n).toString('hex');

const makeLnd = ({cleaned, err}) => {
  return {
    signer: {
      muSig2Cleanup: ({session_id}, cbk) => {
        cleaned.push(bufferAsHex(session_id));

        return cbk(err);
      },
      muSig2CombineSig: ({}, cbk) => cbk('UnexpectedCombineSignatures'),
    },
  };
};

// End sessions and get the ids of the sessions that LND is asked to end
const endedWith = async ({err, sessions}) => {
  const cleaned = [];

  await method({sessions, lnd: makeLnd({cleaned, err})});

  return cleaned;
};

const tests = [
  {
    args: {sessions: []},
    description: 'There is nothing to do without sessions',
    expected: [],
  },
  {
    args: {err: 'err', sessions: [{id: idFor(1)}, {id: idFor(2)}]},
    description: 'A failure to end a session is not an error',
    expected: [idFor(1), idFor(2)],
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
    expected: [idFor(1), idFor(3)],
  },
];

tests.forEach(({args, description, expected}) => {
  return test(description, async () => {
    deepEqual(await endedWith(args), expected, 'Got expected ended sessions');

    return;
  });
});

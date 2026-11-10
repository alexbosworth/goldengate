const {deepEqual} = require('node:assert').strict;
const test = require('node:test');

const method = require('./../../lightninglabs/finish_spend_session');

const bufferAsHex = buffer => Buffer.from(buffer).toString('hex');
const finalSignature = Buffer.alloc(64, 3);
const shortSignature = {final_signature: Buffer.alloc(32)};

const makeLnd = ({combine, sign}) => {
  return {
    signer: {
      muSig2CombineSig: (args, cbk) => {
        if (!!combine) {
          return combine(args, cbk);
        }

        return cbk(null, {
          final_signature: finalSignature,
          have_all_signatures: true,
        });
      },
      muSig2RegisterNonces: ({}, cbk) => cbk(null, {have_all_nonces: true}),
      muSig2Sign: (args, cbk) => {
        if (!!sign) {
          return sign(args, cbk);
        }

        return cbk(null, {local_partial_signature: Buffer.alloc(32, 4)});
      },
    },
  };
};

const makeArgs = overrides => {
  const args = {
    hash: bufferAsHex(Buffer.alloc(32, 5)),
    lnd: makeLnd({}),
    nonce: bufferAsHex(Buffer.alloc(66, 6)),
    signature: bufferAsHex(Buffer.alloc(32, 7)),
  };

  Object.keys(overrides).forEach(k => args[k] = overrides[k]);

  return args;
};

// Finish a session and see if the session is marked as ended
const finish = async args => {
  const session = {id: bufferAsHex(Buffer.alloc(32, 1))};

  try {
    const res = await method({...args, session});

    return {...res, is_ended: session.is_ended};
  } catch (err) {
    return {err, is_ended: session.is_ended};
  }
};

const tests = [
  {
    args: makeArgs({lnd: makeLnd({sign: ({}, cbk) => cbk('err')})}),
    description: 'A session that fails to sign is not ended',
    expected: {
      err: [503, 'UnexpectedErrorSigningMuSig2Session', {err: 'err'}],
      is_ended: undefined,
    },
  },
  {
    args: makeArgs({lnd: makeLnd({combine: ({}, cbk) => cbk('err')})}),
    description: 'A session that fails to combine is not ended',
    expected: {
      err: [503, 'UnexpectedErrorFinishingMuSig2Session', {err: 'err'}],
      is_ended: undefined,
    },
  },
  {
    args: makeArgs({
      lnd: makeLnd({combine: ({}, cbk) => cbk(null, shortSignature)}),
    }),
    description: 'A combined signature is expected',
    expected: {err: [503, 'ExpectedSignatureForSpentUtxo'], is_ended: true},
  },
  {
    args: makeArgs({}),
    description: 'A shared address session signature is combined',
    expected: {is_ended: true, signature: bufferAsHex(finalSignature)},
  },
];

tests.forEach(({args, description, expected}) => {
  return test(description, async () => {
    deepEqual(await finish(args), expected, 'Got expected finish');

    return;
  });
});

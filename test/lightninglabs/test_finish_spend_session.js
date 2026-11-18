const {deepEqual} = require('node:assert').strict;
const test = require('node:test');

const {beginGroupSigningSession} = require('ln-service');
const {makeLnd} = require('mock-lnd');
const {makeRpcError} = require('mock-lnd');
const {verifySchnorr} = require('tiny-secp256k1');

const method = require('./../../lightninglabs/finish_spend_session');
const {sharedAddressCosigner} = require('./../macros');
const {sharedAddressScript} = require('./../../');

const clientKey = '031b84c5567b126440995d3ed5aaba0565d71e1834604819ff9c17f5e9d5dd078f';
const clientSecret = Buffer.alloc(32, 1).toString('hex');
const hash = Buffer.alloc(32, 5).toString('hex');
const hexAsBuffer = hex => Buffer.from(hex, 'hex');
const invalidSignature = 'error combining signatures: error combining partial signature: error combining partial signature: final signature is invalid';
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

// A fake LND where a signer method fails
const failingLnd = rpc => clientLnd({
  failures: [{details: 'err', method: rpc, type: 'signer'}],
});

// A fake LND that combines signatures into a signature that is too short
const shortSignatureLnd = () => {
  const lnd = clientLnd({});

  lnd.signer.muSig2CombineSig = ({}, cbk) => cbk(null, {
    final_signature: Buffer.alloc(32),
    have_all_signatures: true,
  });

  return lnd;
};

// Start a session with the client and get the nonce and sig of the service
const sessionWithService = async ({is_invalid, lnd}) => {
  const cosigner = sharedAddressCosigner({
    client_public_key: clientKey,
    root_hash: address.root_hash,
  });

  const session = await beginGroupSigningSession({
    lnd,
    key_family: 42060,
    key_index: 7,
    public_keys: [serviceKey],
    root_hash: address.root_hash,
  });

  const nonce = cosigner.nonceFor('utxo');

  const signature = cosigner.cosign({hash, key: 'utxo', nonce: session.nonce});

  const invalid = Buffer.alloc(32, 7).toString('hex');

  return {
    nonce,
    key: session.external_key,
    session: {id: session.id},
    signature: !!is_invalid ? invalid : signature,
  };
};

// Finish a session, and see if it is ended and if the signature is valid
const finish = async args => {
  const lnd = args.lnd || clientLnd({});

  const started = await sessionWithService({lnd, is_invalid: args.is_invalid});

  const {session} = started;

  try {
    const res = await method({
      hash,
      lnd,
      session,
      nonce: started.nonce,
      signature: started.signature,
    });

    const key = hexAsBuffer(started.key);
    const message = hexAsBuffer(hash);
    const signature = hexAsBuffer(res.signature);

    const isValid = verifySchnorr(message, key, signature);

    return {is_valid: isValid, is_ended: session.is_ended};
  } catch (err) {
    return {err, is_ended: session.is_ended};
  }
};

const tests = [
  {
    args: {lnd: failingLnd('muSig2Sign')},
    description: 'A session that fails to sign is not ended',
    expected: {
      err: [
        503,
        'UnexpectedErrorSigningMuSig2Session',
        {err: makeRpcError({details: 'err'})},
      ],
      is_ended: undefined,
    },
  },
  {
    args: {lnd: failingLnd('muSig2CombineSig')},
    description: 'A session that fails to combine is not ended',
    expected: {
      err: [
        503,
        'UnexpectedErrorFinishingMuSig2Session',
        {err: makeRpcError({details: 'err'})},
      ],
      is_ended: undefined,
    },
  },
  {
    args: {is_invalid: true},
    description: 'A service signature that is not valid is not combined',
    expected: {
      err: [
        503,
        'UnexpectedErrorFinishingMuSig2Session',
        {err: makeRpcError({details: invalidSignature})},
      ],
      is_ended: undefined,
    },
  },
  {
    args: {lnd: shortSignatureLnd()},
    description: 'A combined signature is expected',
    expected: {err: [503, 'ExpectedSignatureForSpentUtxo'], is_ended: true},
  },
  {
    args: {},
    description: 'A shared address session signature is combined',
    expected: {is_ended: true, is_valid: true},
  },
];

tests.forEach(({args, description, expected}) => {
  return test(description, async () => {
    deepEqual(await finish(args), expected, 'Got expected finish');

    return;
  });
});

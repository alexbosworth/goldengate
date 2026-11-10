const {deepEqual} = require('node:assert').strict;
const EventEmitter = require('node:events');
const {promisify} = require('node:util');
const test = require('node:test');
const {throws} = require('node:assert').strict;

const {subscribeToLegacySwapInStatus} = require('./../../lightninglabs');

const nextTick = promisify(process.nextTick);

// Collect the events of a subscription that are emitted on the next tick
const eventsFrom = async args => {
  const events = [];
  const sub = subscribeToLegacySwapInStatus(args);

  sub.on('error', event => events.push(event));
  sub.on('status_update', event => events.push(event));

  await nextTick();

  return {events};
};

// A swap service that sends a status update, an error and then bad data
const makeService = () => ({
  subscribeLoopInUpdates: args => {
    if (args.protocol_version !== 'MUSIG2') {
      throw new Error('InvalidProtocolVersionSpecified');
    }

    const emitter = new EventEmitter();

    emitter.cancel = () => {};

    process.nextTick(() => {
      emitter.emit('data', {
        state: 'SERVER_FAILED_INVALID_HTLC_AMOUNT',
        timestamp_ns: '1',
      });

      emitter.emit('error', 'err');

      emitter.emit('data', {});

      return;
    });

    return emitter;
  },
});

const makeArgs = overrides => {
  const args = {
    id: Buffer.alloc(32).toString('hex'),
    metadata: {},
    service: makeService(),
  };

  Object.keys(overrides).forEach(k => args[k] = overrides[k]);

  return args;
};

const tests = [
  {
    args: makeArgs({}),
    description: 'Swap status is returned for a subscription',
    expected: {
      events: [
        {
          at: '1970-01-01T00:00:00.000Z',
          is_broadcast: true,
          is_claimed: false,
          is_confirmed: true,
          is_failed: true,
          is_known: true,
        },
        [503, 'UnexpectedSwapInStatusError', {err: 'err'}],
        [503, 'ExpectedSwapStateToDeriveSwapStateDetails'],
      ],
    },
  },
  {
    args: makeArgs({id: undefined}),
    description: 'Swap in status subscription requires a swap id',
    error: [400, 'ExpectedFundingPaymentHashToSubscribeToSwapInStatus'],
  },
  {
    args: makeArgs({metadata: undefined}),
    description: 'Swap in status subscription requires auth metadata',
    error: [400, 'ExpectedAuthenticationMetadataToSubscribeSwapInStatus'],
  },
  {
    args: makeArgs({service: undefined}),
    description: 'Swap in status subscription requires a service object',
    error: [400, 'ExpectedSwapServiceToSubscribeToSwapInStatus'],
  },
];

tests.forEach(({args, description, error, expected}) => {
  return test(description, async () => {
    if (!!error) {
      throws(() => subscribeToLegacySwapInStatus(args), error, 'Got error');
    } else {
      deepEqual(await eventsFrom(args), expected, 'Got expected events');
    }

    return;
  });
});

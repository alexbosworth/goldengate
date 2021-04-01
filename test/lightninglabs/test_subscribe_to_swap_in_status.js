const EventEmitter = require('events');
const {promisify} = require('util');

const {test} = require('tap');

const {subscribeToSwapInStatus} = require('./../../lightninglabs');

const nextTick = promisify(process.nextTick);

const makeArgs = overrides => {
  const args = {
    id: Buffer.alloc(32).toString('hex'),
    metadata: {},
    service: {
      subscribeLoopInUpdates: ({}) => {
        const emitter = new EventEmitter();

        emitter.cancel = () => {};

        process.nextTick(() => {
          emitter.emit('data', {
            state: 'FAILED_INVALID_HTLC_AMOUNT',
            timestamp_ns: '1',
          });

          emitter.emit('error', 'err');

          emitter.emit('data', {});

          return;
        });

        return emitter;
      },
    },
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
  return test(description, async ({equal, end, strictSame, throws}) => {
    if (!!error) {
      throws(() => subscribeToSwapInStatus(args), error, 'Got expected err');
    } else {
      const events = [];
      const sub = subscribeToSwapInStatus(args);

      sub.on('error', event => events.push(event));
      sub.on('status_update', event => events.push(event));

      await nextTick();

      strictSame(events, expected.events, 'Got expected events');

      const sub2 = subscribeToSwapInStatus(args);
    }

    return end();
  });
});

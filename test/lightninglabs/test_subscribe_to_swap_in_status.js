const {deepEqual} = require('node:assert').strict;
const EventEmitter = require('node:events');
const test = require('node:test');
const {throws} = require('node:assert').strict;

const {subscribeToSwapInStatus} = require('./../../');

const ignore = () => {};
const metadata = {get: () => []};
const nonce = Buffer.alloc(66, 2);
const prevoutId = Buffer.from(Array.from({length: 32}, (_, i) => i));
const psbt = Buffer.from('70736274ff', 'hex');
const shortHash = Buffer.alloc(31);
const swapHash = Buffer.alloc(32, 3);
const utxoId = Buffer.alloc(32, 1).toString('hex');

const base64Hash = swapHash.toString('base64');
const id = swapHash.toString('hex');

// Listen to all of the events of a subscription
const allEvents = {
  coop_settlement: ignore,
  end: ignore,
  error: ignore,
  risk_accepted: ignore,
  risk_rejected: ignore,
};

const prevout = {
  output_index: 1,
  pk_script: Buffer.from('5120', 'hex'),
  txid_bytes: prevoutId,
  value: '200000',
};

const sweep = {
  deposit_to_nonces: {[`${utxoId}:1`]: nonce},
  prevout_info: [prevout],
  swap_hash: swapHash,
  sweep_tx_psbt: psbt,
};

// The swap in settlement that is emitted for the settlement notification
const settlement = {
  id,
  nonces: [{
    nonce: nonce.toString('hex'),
    transaction_id: utxoId,
    transaction_vout: 1,
  }],
  prevouts: [{
    script: '5120',
    tokens: 200000,
    transaction_id: Buffer.from(prevoutId).reverse().toString('hex'),
    transaction_vout: 1,
  }],
  psbt: psbt.toString('hex'),
};

// A data event with a notification of a type from the service
const data = (type, details) => {
  return ['data', {notification: type, [type]: details}];
};

// A listener that throws an error
const raise = () => {
  throw new Error('ListenerError');
};

// A data event with a swap in settlement notification, with changes
const sweepData = changes => {
  return data('static_loop_in_sweep', {...sweep, ...changes});
};

// A fake notifications stream that emits events when it is told to notify
const makeService = ({emits, isUncancelable}) => {
  const service = {
    subscribeNotifications: (args, auth) => {
      const sub = new EventEmitter();

      // The subscription is expected to be for a V1 listener with metadata
      const isExpected = args.version === 'V1' && auth === metadata;

      if (!isUncancelable) {
        sub.cancel = () => service.is_canceled = true;
      }

      service.notify = () => {
        if (!isExpected) {
          return sub.emit('error', 'UnexpectedSubscribeNotificationsRequest');
        }

        return emits.forEach(([event, details]) => sub.emit(event, details));
      };

      return sub;
    },
  };

  return service;
};

const makeArgs = overrides => {
  const args = {metadata, service: makeService({emits: []})};

  Object.keys(overrides).forEach(k => args[k] = overrides[k]);

  return args;
};

// Listen to a subscription, then see what is emitted for the notifications
const eventsOf = ({args, listen, remove}) => {
  const events = [];
  const sub = subscribeToSwapInStatus(args);

  // Listeners note the events they get, then run
  Object.keys(listen).forEach(event => {
    return sub.on(event, details => {
      events.push([event, details]);

      return listen[event](details);
    });
  });

  try {
    args.service.notify();
  } catch (err) {
    return {err, events};
  }

  // Listeners can be removed after the notifications
  (remove || []).forEach(event => sub.removeAllListeners(event));

  return {events, is_canceled: !!args.service.is_canceled};
};

const tests = [
  {
    args: makeArgs({metadata: undefined}),
    description: 'Authentication metadata is required',
    error: [400, 'ExpectedAuthenticationMetadataToSubscribeToSwapInStatus'],
  },
  {
    args: makeArgs({service: {}}),
    description: 'A service is required',
    error: [400, 'ExpectedServiceToSubscribeToSwapInStatus'],
  },
  {
    args: makeArgs({
      service: makeService({
        emits: [
          data('static_loop_in_risk_accepted', {swap_hash: swapHash}),
          data('static_loop_in_risk_rejected', {swap_hash: base64Hash}),
          sweepData({}),
          // Notifications that are not about shared swap ins are ignored
          data('unfinished_swap', {is_loop_in: true, swap_hash: swapHash}),
          ['error', 'err'],
          ['end'],
        ],
      }),
    }),
    description: 'Shared swap in notifications are emitted',
    expected: {
      events: [
        ['risk_accepted', {id}],
        ['risk_rejected', {id}],
        ['coop_settlement', settlement],
        [
          'error',
          [503, 'UnexpectedSwapInStatusSubscriptionError', {err: 'err'}],
        ],
        ['end', {}],
      ],
      is_canceled: false,
    },
    listen: allEvents,
  },
  {
    args: makeArgs({
      service: makeService({
        emits: [
          sweepData({sweep_tx_psbt: Buffer.alloc(0)}),
          sweepData({deposit_to_nonces: {}}),
          sweepData({deposit_to_nonces: {outpoint: nonce}}),
          sweepData({deposit_to_nonces: {[`${utxoId}:1`]: Buffer.alloc(65)}}),
          sweepData({prevout_info: [{...prevout, txid_bytes: shortHash}]}),
          sweepData({prevout_info: [{...prevout, value: 'value'}]}),
          data('static_loop_in_risk_accepted', {swap_hash: shortHash}),
        ],
      }),
    }),
    description: 'Invalid notifications are errors',
    expected: {
      events: [
        ['error', [503, 'ExpectedPsbtInCoopSettlementNotification']],
        ['error', [503, 'ExpectedUtxoNoncesInCoopSettlement']],
        ['error', [503, 'ExpectedUtxoOutpointInCoopSettlement']],
        ['error', [503, 'ExpectedUtxoNonceInCoopSettlement']],
        ['error', [503, 'ExpectedPrevoutTransactionIdInCoopSettlement']],
        ['error', [503, 'ExpectedPrevoutValueInCoopSettlement']],
        ['error', [503, 'ExpectedSwapHashInServiceNotification']],
      ],
      is_canceled: false,
    },
    listen: allEvents,
  },
  {
    args: makeArgs({
      service: makeService({
        emits: [['error', 'err'], sweepData({sweep_tx_psbt: null})],
      }),
    }),
    description: 'Errors are not emitted without error listeners',
    expected: {events: [], is_canceled: false},
    listen: {coop_settlement: ignore},
  },
  {
    args: makeArgs({
      service: makeService({
        emits: [data('static_loop_in_risk_accepted', {})],
      }),
    }),
    description: 'A notification without a swap hash is an error',
    expected: {
      events: [['error', [503, 'ExpectedSwapHashInServiceNotification']]],
      is_canceled: false,
    },
    listen: {error: ignore, risk_accepted: ignore},
  },
  {
    args: makeArgs({service: makeService({emits: [sweepData({})]})}),
    description: 'Errors thrown by event listeners are not caught',
    expected: {
      err: new Error('ListenerError'),
      events: [['coop_settlement', settlement]],
    },
    listen: {coop_settlement: raise, error: ignore},
  },
  {
    args: makeArgs({}),
    description: 'An error listener keeps the subscription active',
    expected: {events: [], is_canceled: false},
    listen: {coop_settlement: ignore, error: ignore},
    remove: ['coop_settlement'],
  },
  {
    args: makeArgs({}),
    description: 'The subscription is canceled when listeners are removed',
    expected: {events: [], is_canceled: true},
    listen: {coop_settlement: ignore, error: ignore},
    remove: ['coop_settlement', 'error'],
  },
  {
    args: makeArgs({service: makeService({emits: [], isUncancelable: true})}),
    description: 'A subscription without cancel is left alone',
    expected: {events: [], is_canceled: false},
    listen: {end: ignore},
    remove: ['end'],
  },
];

tests.forEach(({args, description, error, expected, listen, remove}) => {
  return test(description, () => {
    if (!!error) {
      throws(() => subscribeToSwapInStatus(args), error, 'Got error');
    } else {
      deepEqual(eventsOf({args, listen, remove}), expected, 'Got events');
    }

    return;
  });
});

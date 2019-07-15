const EventEmitter = require('events');

const asyncAuto = require('async/auto');
const asyncWhilst = require('async/whilst');
const {subscribeToBlocks} = require('ln-service');

const {getChainTip} = require('./../blockstream');

const {now} = Date;
const requestDelayMs = 1000 * 60 * 10;
const tickDelayMs = 20;

/** Subscribe to blocks

  {
    [delay]: <Poll Delay Milliseconds Number> // default 10 minutes
    [lnd]: <Authenticated LND gRPC Object>
    [network]: <Network Name String>
    [request]: <Request Function>
  }

  @throws
  <Error>

  @returns
  <EventEmitter Object>

  @event 'block'
  {
    height: <Block Height Number>
    id: <Block Hash String>
  }
*/
module.exports = ({delay, lnd, network, request}) => {
  if (!lnd && !request) {
    throw new Error('ExpectedLndOrRequestToSubscribeToBlocks');
  }

  if (!!request && !network) {
    throw new Error('ExpectedNetworkNameToSubscribeToBlocks');
  }

  let currentHeight;
  const emitter = new EventEmitter();
  let lastAttempt = 0;

  if (!!lnd) {
    const sub = subscribeToBlocks({lnd});

    sub.on('block', ({height, id}) => emitter.emit('block', {height, id}));
    sub.on('end', () => {});
    sub.on('error', err => emitter.emit('error', err));
    sub.on('status', () => {});

    emitter.on('removeListener', () => {
      // Exit early when there are still listeners
      if (!!emitter && !!emitter.listenerCount('block')) {
        return;
      }

      sub.removeAllListeners();

      return;
    });
  }

  if (!!request) {
    asyncWhilst(
      cbk => {
        return setTimeout(() => {
          return cbk(null, !!emitter.listenerCount('block'));
        },
        tickDelayMs);
      },
      cbk => {
        if (now() - lastAttempt < (delay || requestDelayMs)) {
          return cbk();
        }

        return getChainTip({network, request}, (err, res) => {
          lastAttempt = now();

          if (!!err) {
            emitter.emit('error', err);
          } else {
            emitter.emit('block', {height: res.height, id: res.id});
          }

          return cbk();
        });
      },
      cbk => emitter.removeAllListeners()
    );
  }

  return emitter;
};

const EventEmitter = require('events');

const {protocolVersion} = require('./conf/swap_service');
const swapStateAsState = require('./swap_state_as_state');

const hexAsBuffer = hex => Buffer.from(hex, 'hex');

/** Subscribe to the server status of a swap out

  {
    id: <Swap Funding Hash Hex String>
    metadata: <Authentication Metadata Object>
    service: <Swap Service Object>
  }

  @throws
  <Error Object>

  @returns
  <EventEmitter Object>

  @event 'status_update'
  {
    at: <Last Updated At ISO 8601 Date String>
    [is_broadcast]: <HTLC Published To Mempool Bool>
    [is_claimed]: <HTLC Claimed With Preimage Bool>
    [is_confirmed]: <HTLC Confirmed In Blockchain Bool>
    [is_failed]: <Swap Failed Bool>
    [is_known]: <Swap Is Recognized By Server Bool>
    [is_refunded]: <Swap Is Refunded With Timeout On Chain Bool>
  }
*/
module.exports = ({id, metadata, service}) => {
  if (!id) {
    throw [400, 'ExpectedFundingPaymentHashToSubscribeToSwapOutStatus'];
  }

  if (!metadata) {
    throw [400, 'ExpectedAuthenticationMetadataToSubscribeSwapOutState'];
  }

  if (!service) {
    throw [400, 'ExpectedSwapServiceToSubscribeToSwapOutStatus'];
  }

  const emitter = new EventEmitter();

  const sub = service.subscribeLoopOutUpdates({
    protocol_version: protocolVersion,
    swap_hash: hexAsBuffer(id),
  },
  metadata);

  sub.on('data', data => {
    const state = {};

    try {
      const update = swapStateAsState(data);

      return emitter.emit('status_update', update);
    } catch (err) {
      // Exit early when there are no error listeners
      if (!emitter.listenerCount('error')) {
        return;
      }

      sub.cancel();

      sub.removeAllListeners();

      return emitter.emit('error', [503, err.message]);
    }
  });

  sub.on('error', err => {
    // Exit early when there are no error listeners
    if (!emitter.listenerCount('error')) {
      return;
    }

    return emitter.emit('error', [503, 'UnexpectedSwapOutStatusError', {err}]);
  });

  return emitter;
};

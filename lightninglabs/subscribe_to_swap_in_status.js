const EventEmitter = require('events');

const {Metadata} = require('grpc');

const {protocolVersion} = require('./conf/swap_service');
const swapStateAsState = require('./swap_state_as_state');

const authHeader = 'Authorization';
const hexAsBuffer = hex => Buffer.from(hex, 'hex');

/** Subscribe to the server status of a swap in

  {
    id: <Swap Funding Hash Hex String>
    macaroon: <Base64 Encoded Macaroon String>
    preimage: <Authentication Preimage Hex String>
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
module.exports = ({id, macaroon, preimage, service}) => {
  if (!id) {
    throw [400, 'ExpectedFundingPaymentHashToSubscribeToSwapInStatus'];
  }

  if (!macaroon) {
    throw [400, 'ExpectedMacaroonToSubscribeToSwapInStatus'];
  }

  if (!preimage) {
    throw [400, 'ExpectedPreimageToSubscribeToSwapInStatus'];
  }

  if (!service) {
    throw [400, 'ExpectedSwapServiceToSubscribeToSwapInStatus'];
  }

  const emitter = new EventEmitter();
  const metadata = new Metadata();

  metadata.add(authHeader, `LSAT ${macaroon}:${preimage}`);

  const sub = service.subscribeLoopInUpdates({
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

    return emitter.emit('error', [503, 'UnexpectedSwapInStatusError', {err}]);
  });

  return emitter;
};

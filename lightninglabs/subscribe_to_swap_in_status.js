const EventEmitter = require('events');

const asBuffer = n => Buffer.from(n.toString('base64'), 'base64');
const bufferAsHex = buffer => buffer.toString('hex');
const hashLength = 32;
const {isSafeInteger} = Number;
const {keys} = Object;
const listenerVersion = 'V1';
const maxIndex = 0xffffffff;
const nonceLength = 66;
const outpointPattern = /^([0-9A-F]{64}):([0-9]{1,10})$/i;
const reversed = buffer => Buffer.from(buffer).reverse();

/** Subscribe to the status of swap ins with the swap service

  {
    metadata: <Authentication Metadata Object>
    service: <Swap Service Object>
  }

  @throws
  <Error Object>

  @returns
  <EventEmitter Object>

  // The service accepted the risk of the utxos and will pay the swap
  @event 'risk_accepted'
  {
    id: <Swap Hash Hex String>
  }

  // The service stopped waiting for the utxos and will not pay the swap
  @event 'risk_rejected'
  {
    id: <Swap Hash Hex String>
  }

  // The service asks to cosign a swap in settlement, check it is paid first
  @event 'coop_settlement'
  {
    id: <Swap Hash Hex String>
    nonces: [{
      nonce: <Service MuSig2 Public Nonce Hex String>
      transaction_id: <Utxo Transaction Id Hex String>
      transaction_vout: <Utxo Transaction Output Index Number>
    }]
    prevouts: [{
      script: <Spending Output Script Hex String>
      tokens: <Spending Output Tokens Number>
      transaction_id: <Spending Transaction Id Hex String>
      transaction_vout: <Spending Transaction Output Index Number>
    }]
    psbt: <Settlement Transaction PSBT Hex String>
  }

  // The subscription ended
  @event 'end'

  // A notification could not be read or the subscription failed
  @event 'error'
  <Error Object>
*/
module.exports = ({metadata, service}) => {
  if (!metadata) {
    throw [400, 'ExpectedAuthenticationMetadataToSubscribeToSwapInStatus'];
  }

  if (!service || !service.subscribeNotifications) {
    throw [400, 'ExpectedServiceToSubscribeToSwapInStatus'];
  }

  const emitter = new EventEmitter();

  const events = [
    'end',
    'error',
    'risk_accepted',
    'risk_rejected',
    'coop_settlement',
  ];

  const sub = service.subscribeNotifications({
    version: listenerVersion,
  },
  metadata);

  const emitError = err => {
    // Exit early when there are no error listeners
    if (!emitter.listenerCount('error')) {
      return;
    }

    return emitter.emit('error', err);
  };

  // Get the swap hash out of a notification
  const swapHash = notification => {
    if (!notification || !notification.swap_hash) {
      throw new Error('ExpectedSwapHashInServiceNotification');
    }

    const hash = asBuffer(notification.swap_hash);

    if (hash.length !== hashLength) {
      throw new Error('ExpectedSwapHashInServiceNotification');
    }

    return bufferAsHex(hash);
  };

  // Get the settlement details out of a swap in settlement notification
  const sweepDetails = sweep => {
    const id = swapHash(sweep);

    const psbt = !sweep.sweep_tx_psbt ? '' : asBuffer(sweep.sweep_tx_psbt);

    if (!psbt.length) {
      throw new Error('ExpectedPsbtInCoopSettlementNotification');
    }

    const utxos = sweep.deposit_to_nonces || {};

    const nonces = keys(utxos).map(outpoint => {
      const [, transactionId, vout] = outpoint.match(outpointPattern) || [];

      if (!transactionId || Number(vout) > maxIndex) {
        throw new Error('ExpectedUtxoOutpointInCoopSettlement');
      }

      const nonce = asBuffer(utxos[outpoint]);

      if (nonce.length !== nonceLength) {
        throw new Error('ExpectedUtxoNonceInCoopSettlement');
      }

      return {
        nonce: bufferAsHex(nonce),
        transaction_id: transactionId.toLowerCase(),
        transaction_vout: Number(vout),
      };
    });

    if (!nonces.length) {
      throw new Error('ExpectedUtxoNoncesInCoopSettlement');
    }

    const prevouts = (sweep.prevout_info || []).map(prevout => {
      const id = !prevout.txid_bytes ? '' : asBuffer(prevout.txid_bytes);

      if (id.length !== hashLength) {
        throw new Error('ExpectedPrevoutTransactionIdInCoopSettlement');
      }

      const tokens = Number(prevout.value);

      if (!isSafeInteger(tokens) || tokens < 0) {
        throw new Error('ExpectedPrevoutValueInCoopSettlement');
      }

      const script = !prevout.pk_script ? '' : asBuffer(prevout.pk_script);

      return {
        tokens,
        script: bufferAsHex(script),
        transaction_id: bufferAsHex(reversed(id)),
        transaction_vout: Number(prevout.output_index),
      };
    });

    return {id, nonces, prevouts, psbt: bufferAsHex(psbt)};
  };

  // Read a service notification as an event, or an error when it is invalid
  const readNotification = data => {
    try {
      switch (data.notification) {
      case 'static_loop_in_risk_accepted':
        return {
          details: {id: swapHash(data.static_loop_in_risk_accepted)},
          event: 'risk_accepted',
        };

      case 'static_loop_in_risk_rejected':
        return {
          details: {id: swapHash(data.static_loop_in_risk_rejected)},
          event: 'risk_rejected',
        };

      case 'static_loop_in_sweep':
        return {
          details: sweepDetails(data.static_loop_in_sweep),
          event: 'coop_settlement',
        };

      default:
        return {};
      }
    } catch (err) {
      return {error: [503, err.message]};
    }
  };

  // Stop the subscription when there is nothing listening to it anymore
  emitter.on('removeListener', () => {
    // Exit early when there are still listeners
    if (events.some(event => !!emitter.listenerCount(event))) {
      return;
    }

    // Exit early when the subscription cannot be canceled
    if (!sub.cancel) {
      return;
    }

    return sub.cancel();
  });

  sub.on('data', data => {
    // Notifications are read before emitting so listener errors are not caught
    const notification = readNotification(data);

    if (!!notification.error) {
      return emitError(notification.error);
    }

    // Exit early when the notification is not a swap in notification
    if (!notification.event) {
      return;
    }

    return emitter.emit(notification.event, notification.details);
  });

  sub.on('end', () => emitter.emit('end', {}));

  sub.on('error', err => {
    return emitError([503, 'UnexpectedSwapInStatusSubscriptionError', {err}]);
  });

  return emitter;
};

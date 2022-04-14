const EventEmitter = require('events');

const asyncWhilst = require('async/whilst');
const {subscribeToChainSpend} = require('ln-service');

const {getSpendFromBlockstream} = require('./../blockstream');

const {now} = Date;
const requestDelayMs = 1000 * 60 * 3;
const tickDelayMs = 20;

/** Subscribe to the spend of an outpoint

  {
    [lnd]: <Authenticated LND API Object>
    min_height: <Starting Height To Watch for Spend Number>
    [network]: <Network Name String>
    output_script: <Spending Script Hex String>
    [request]: <Request Function>
    [delay_ms]: <Polling Frequency Milliseconds Number>
    transaction_id: <Spending Outpoint Transaction Id Hex String>
    transaction_vout: <Spending Outpoint Transaction Output Index Number>
  }

  @event 'confirmation'
  {
    transaction: <Raw Transaction Hex String>
  }

  @returns
  <Event Emitter Object>
*/
module.exports = args => {
  // Exit early when using an LND chain spend notifier
  if (!args.request) {
    return subscribeToChainSpend({
      lnd: args.lnd,
      min_height: args.min_height,
      output_script: args.output_script,
      transaction_id: args.transaction_id,
      transaction_vout: args.transaction_vout,
    });
  };

  const emitter = new EventEmitter();
  let lastAttempt = Number();

  asyncWhilst(
    cbk => {
      const timer = setTimeout(() => {
        return cbk(null, !!emitter.listenerCount('confirmation'));
      },
      tickDelayMs);
    },
    cbk => {
      if (now() - lastAttempt < (args.delay_ms || requestDelayMs)) {
        return cbk();
      }

      return getSpendFromBlockstream({
        network: args.network,
        request: args.request,
        transaction_id: args.transaction_id,
        transaction_vout: args.transaction_vout,
      },
      (err, res) => {
        lastAttempt = now();

        if (!!err && !!emitter.listenerCount('error')) {
          emitter.emit('error', err);
        }

        // Exit early with error
        if (!!err) {
          return cbk(err);
        }

        // Exit early when the output is not yet spent
        if (!res.transaction) {
          return cbk();
        }

        emitter.emit('confirmation', {transaction: res.transaction});

        return cbk();
      });
    },
    cbk => emitter.removeAllListeners()
  );

  return emitter;
};

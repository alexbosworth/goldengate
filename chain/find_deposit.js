const {address} = require('bitcoinjs-lib');
const asyncRetry = require('async/retry');
const {subscribeToChainAddress} = require('ln-service');
const {Transaction} = require('bitcoinjs-lib');

const findOutput = require('./find_output');
const {findSpend} = require('./../blockstream');
const {names} = require('./../conf/bitcoinjs-lib');
const {outputScriptForAddress} = require('./../address');

const {ceil} = Math;
const {fromHex} = Transaction;
const msPerMin = 1000 * 60;
const notFoundIndex = -1;
const sPub = (address, network) => outputScriptForAddress({address, network});

/** Find a deposit to a chain address.

  Either lnd or an http request function is required.

  An `after` height is required if `lnd` is given
  A `network` name is required if `request` is given

  {
    [address]: <Chain Address String>
    [after]: <After Chain Height Number>
    confirmations: <Swap Deposit Confirmations Count Number>
    [lnd]: <Authenticated LND API gRPC Object>
    [network]: <Network Name String>
    [output_script]: <Output Script Hex String>
    [poll_interval_ms]: <Request Poll Interval Milliseconds Number>
    [request]: <HTTP Request Function>
    timeout: <Timeout Milliseconds Number>
    tokens: <Swap Tokens Number>
    [transaction_id]: <Sweep Source Transaction Id Hex String>
    [transaction_vout]: <Sweep Source Transaction Vout Number>
  }

  @returns via cbk
  {
    output_tokens: <Output Tokens Number>
    transaction_id: <Transaction Id Hex String>
    transaction_vout: <Transaction Output Index Number>
  }
*/
module.exports = (args, cbk) => {
  if (!args.address && !args.output_script) {
    return cbk([400, 'ExpectedChainAddressOrScriptToFindDepositTo']);
  }

  if (!args.after && !!args.lnd) {
    return cbk([400, 'ExpectedChainHeightToFindDepositAfter']);
  }

  if (!args.lnd && !args.request) {
    return cbk([400, 'ExpectedChainLndOrRequestFunctionToFindDeposit']);
  }

  if (args.confirmations === undefined) {
    return cbk([400, 'ExpectedConfirmationsToFindDeposit']);
  }

  if (!args.network && !args.request) {
    return cbk([400, 'ExpectedNetworkToFindDeposit']);
  }

  if (!args.timeout) {
    return cbk([400, 'ExpectedTimeoutMillisecondsToStopWaitingForDeposit']);
  }

  if (!args.tokens && !args.transaction_id) {
    return cbk([400, 'ExpectedDepositedTokensInDeposit']);
  }

  if (!!args.transaction_id && args.transaction_vout === undefined) {
    return cbk([400, 'ExpectedTransactionVoutWhenFindingUtxoSpendDeposit']);
  }

  if (!args.lnd) {
    const interval = args.poll_interval_ms || msPerMin;

    const times = ceil(args.timeout / interval);

    return asyncRetry({interval, times}, cbk => {
      return findSpend({
        address: args.address,
        confirmations: args.confirmations,
        network: args.network,
        output_script: args.output_script,
        request: args.request,
        tokens: args.tokens,
        transaction_id: args.transaction_id,
        transaction_vout: args.transaction_vout,
      },
      cbk);
    },
    cbk);
  }

  const script = args.output_script || sPub(args.address, args.network).script;

  const sub = subscribeToChainAddress({
    lnd: args.lnd,
    min_confirmations: args.confirmations,
    min_height: args.after,
    output_script: script,
  });

  let timeout;

  const finished = (err, res) => {
    clearTimeout(timeout);

    sub.removeAllListeners();

    return cbk(err, res);
  };

  timeout = setTimeout(() => {
    return finished([503, 'FailedToFindDepositWithinTimeoutTime']);
  },
  args.timeout);

  sub.once('end', () => finished([503, 'SubscriptionEndWithoutDeposit']));

  sub.once('error', err => finished([503, 'FailedToFindChainDeposit', {err}]));

  sub.on('status', () => {});

  sub.on('confirmation', ({transaction}) => {
    const {output} = findOutput({
      script,
      transaction,
      id: args.transaction_id,
      tokens: args.tokens,
      vout: args.transaction_vout,
    });

    if (!output) {
      return;
    }

    return finished(null, {
      output_tokens: output.tokens,
      transaction_id: output.id,
      transaction_vout: output.vout,
    });
  });

  return;
};

const {serverSwapFailure} = require('./conf/swap_service');
const {serverSwapProgress} = require('./conf/swap_service');

const asDate = ns => new Date(Number(BigInt(ns) / BigInt(1e6))).toISOString();

/** Get swap status from swap state

  {
    state: <Swap State String>
    timestamp_ns: <Epoch Timestamp Nanoseconds String>
  }

  @returns
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
module.exports = args => {
  if (!args.state) {
    throw new Error('ExpectedSwapStateToDeriveSwapStateDetails');
  }

  if (!args.timestamp_ns) {
    throw new Error('ExpectedSwapUpdateTimestampToDeriveSwapStateDetails');
  }

  const at = asDate(args.timestamp_ns);

  switch (args.state) {
  case serverSwapFailure.incorrect_htlc_amount:
  case serverSwapFailure.payment_not_completed_offchain:
    return {
      at,
      is_broadcast: true,
      is_claimed: false,
      is_confirmed: true,
      is_failed: true,
      is_known: true,
    };

  case serverSwapFailure.late_or_missing_htlc_onchain:
    return {at, is_claimed: false, is_failed: true, is_known: true};

  case serverSwapFailure.publish_onchain_htlc_failed:
  case serverSwapFailure.publish_onchain_htlc_too_slow:
    return {
      at,
      is_broadcast: false,
      is_claimed: false,
      is_confirmed: false,
      is_failed: true,
      is_known: true,
      is_refunded: false,
    };

  case serverSwapFailure.refunded:
    return {
      at,
      is_broadcast: true,
      is_claimed: false,
      is_confirmed: true,
      is_failed: true,
      is_known: true,
      is_refunded: true,
    };

  case serverSwapFailure.refunding:
    return {
      at,
      is_broadcast: true,
      is_claimed: false,
      is_known: true,
      is_refunded: false,
    };

  case serverSwapProgress.broadcast:
    return {
      at,
      is_broadcast: true,
      is_claimed: false,
      is_confirmed: false,
      is_failed: false,
      is_known: true,
      is_refunded: false,
    };

  case serverSwapProgress.claimed:
    return {
      at,
      is_broadcast: true,
      is_claimed: true,
      is_confirmed: true,
      is_failed: false,
      is_known: true,
      is_refunded: false,
    };

  case serverSwapProgress.confirmed:
    return {
      at,
      is_broadcast: true,
      is_claimed: false,
      is_confirmed: true,
      is_failed: false,
      is_known: true,
      is_refunded: false,
    };

  case serverSwapProgress.started:
    return {
      at,
      is_broadcast: false,
      is_claimed: false,
      is_confirmed: false,
      is_failed: false,
      is_known: true,
      is_refunded: false,
    };

  case serverSwapFailure.unexpected:
  case serverSwapFailure.unknown:
    return {at, is_failed: true, is_known: true};

  default:
    return {at};
  }
};

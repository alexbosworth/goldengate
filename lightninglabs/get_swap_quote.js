const {getGrpcInterface} = require('./../grpc');

const decBase = 10;

/** Get swap quote from swap service

  {
    service: <Swap Service Object>
  }

  @returns via cbk
  {
    base_fee: <Base Fee Tokens Number>
    cltv_delta: <CLTV Delta Number>
    deposit: <Deposit Tokens Number>
    destination: <Destination Public Key Hex String>
    fee_rate: <Fee Rate in Parts Per Million Number>
    max_tokens: <Maximum Swap Tokens Number>
    min_tokens: <Minimum Swap Tokens Number>
  }
*/
module.exports = ({service}, cbk) => {
  if (!service || !service.loopOutQuote) {
    return cbk([400, 'ExpectedServiceToGetSwapQuote']);
  }

  return service.loopOutQuote({}, (err, res) => {
    if (!!err) {
      return cbk([503, 'UnexpectedErrorGettingSwapQuote', err]);
    }

    if (!res) {
      return cbk([503, 'ExpectedResponseWhenGettingSwapQuote']);
    }

    if (!res.cltv_delta) {
      return cbk([503, 'ExpectedCltvDeltaInSwapQuoteResponse']);
    }

    if (!res.max_swap_amount) {
      return cbk([503, 'ExpectedMaxSwapAmountInSwapQuoteResponse']);
    }

    if (!res.min_swap_amount) {
      return cbk([503, 'ExpectedMinSwapAmountInSwapQuoteResponse']);
    }

    if (!res.prepay_amt) {
      return cbk([503, 'ExpectedPrepayAmountInSwapQuoteResponse']);
    }

    if (!res.swap_fee_base) {
      return cbk([503, 'ExpectedSwapFeeBaseRateInSwapQuoteResponse']);
    }

    if (!res.swap_fee_rate) {
      return cbk([503, 'ExpectedSwapFeeRateInSwapQuoteResponse']);
    }

    if (!res.swap_payment_dest) {
      return cbk([503, 'ExpectedSwapPaymentDestinationPublicKey']);
    }

    return cbk(null, {
      base_fee: parseInt(res.swap_fee_base, decBase),
      cltv_delta: res.cltv_delta,
      deposit: parseInt(res.prepay_amt, decBase),
      destination: res.swap_payment_dest,
      fee_rate: parseInt(res.swap_fee_rate, decBase),
      max_tokens: parseInt(res.max_swap_amount, decBase),
      min_tokens: parseInt(res.min_swap_amount, decBase),
    });
  });
};

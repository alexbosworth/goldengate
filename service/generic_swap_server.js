const bodyParser = require('body-parser')
const express = require('express');

const defaultSwapInBaseFee = 5000;
const defaultSwapInFeeRate = 1500;
const defaultSwapInCltv = 1000;
const defaultSwapOutBaseFee = 500;
const defaultSwapOutFeeRate = 500;
const defaultMaxSwapInTokens = 30e6;
const defaultMinSwapInTokens = 250e3;
const defaultMaxSwapOutCltv = 400;
const defaultMaxSwapOutTokens = 30e6;
const defaultMinSwapOutCltv = 100;
const defaultMinSwapOutTokens = 250e3;
const defaultSwapOutDeposit = 30e3;
const feeRateDenominator = BigInt(1e6);
const methodNewSwapIn = 'newLoopInSwap';
const methodSwapInQuote = 'loopInQuote';
const methodSwapInTerms = 'loopInTerms';
const methodSwapOutPushPreimage = 'loopOutPushPreimage';
const methodSwapOutQuote = 'loopOutQuote';
const methodSwapOutTerms = 'loopOutTerms';
const path = method => `/v0/${method}`;

/** Create generic swap server

  {
    destination: <Destination Hex String>
    handle_swap_in: <Respond to Swap In Promise>
    [max_swap_in_tokens]: <Maximum Swap In Tokens Number>
    [min_swap_in_tokens]: <Minimum Swap In Tokens Number>
    [max_swap_out_cltv]: <Maximum Swap Out CLTV Delta Number>
    [max_swap_out_tokens]: <Maximum Swap Out Tokens Number>
    [min_swap_out_cltv]: <Minimum Swap Out CLTV Delta Number>
    [min_swap_out_tokens]: <Minimum Swap Out Tokens Number>
    [swap_in_base_fee]: <Swap In Base Fee Tokens Number>
    [swap_in_fee_rate]: <Swap In Fee Rate Parts Per Million Number>
    [swap_in_cltv]: <Swap In CLTV Delta Number>
    [swap_out_base_fee]: <Swap Out Base Fee Tokens Number>
    [swap_out_deposit]: <Swap Out Deposit Tokens Number>
    [swap_out_fee_rate]: <Swap Out Fee Rate Parts Per Million Number>
  }

  @returns
  {
    app: <Generic Swap Server Application Object>
  }
*/
module.exports = args => {
  const app = express();

  app.use(bodyParser.json());

  app.post(path(methodNewSwapIn), async (req, res) => {
    try {
      return res.json(await args.handle_swap_in({}));
    } catch (err) {
      return res.json(err);
    }
  });

  app.post(path(methodSwapInQuote), (req, res) => {
    const swapInBaseFee = args.swap_in_base_fee || defaultSwapInBaseFee;
    const swapInFeeRate = args.swap_in_fee_rate || defaultSwapInFeeRate;
    const tokens = Number(req.body.amt);

    const rate = BigInt(tokens) * BigInt(swapInFeeRate) / feeRateDenominator;

    return res.json({
      cltv_delta: args.swap_in_cltv || defaultSwapInCltv,
      swap_fee: (swapInBaseFee + Number(rate)).toString(),
    });
  });

  app.post(path(methodSwapInTerms), (req, res) => {
    return res.json({
      max_swap_amount: args.max_swap_in_tokens || defaultMaxSwapInTokens,
      min_swap_amount: args.min_swap_in_tokens || defaultMinSwapInTokens,
    });
  });

  app.post(path(methodSwapOutPushPreimage), (req, res) => res.json({}));

  app.post(path(methodSwapOutQuote), (req, res) => {
    const swapOutBaseFee = args.swap_out_base_fee || defaultSwapOutBaseFee;
    const swapOutFeeRate = args.swap_out_fee_rate || defaultSwapOutFeeRate;
    const tokens = Number(req.body.amt);

    const rate = BigInt(tokens) * BigInt(swapOutFeeRate) / feeRateDenominator;

    return res.json({
      prepay_amt: args.swap_out_deposit || defaultSwapOutDeposit,
      swap_fee: (swapOutBaseFee + Number(rate)).toString(),
      swap_payment_dest: args.destination,
    });
  });

  app.post(path(methodSwapOutTerms), (req, res) => {
    return res.json({
      max_cltv_delta: args.max_swap_out_cltv || defaultMaxSwapOutCltv,
      max_swap_amount: args.max_swap_out_tokens || defaultMaxSwapOutTokens,
      min_cltv_delta: args.min_swap_out_cltv || defaultMinSwapOutCltv,
      min_swap_amount: args.min_swap_out_tokens || defaultMinSwapOutTokens,
    });
  });

  return {app};
};

const express = require('express');

const defaultMaxSwapOutCltv = 400;
const defaultMaxSwapOutTokens = 30e6;
const defaultMinSwapOutCltv = 100;
const defaultMinSwapOutTokens = 250e3;
const methodSwapOutTerms = 'loopOutTerms';
const path = method => `/v0/${method}`;

/** Create generic swap server

  {
    [max_swap_out_cltv]: <Maximum Swap Out CLTV Delta Number>
    [max_swap_out_tokens]: <Maximum Swap Out Tokens Number>
    [min_swap_out_cltv]: <Minimum Swap Out CLTV Delta Number>
    [min_swap_out_tokens]: <Minimum Swap Out Tokens Number>
  }

  @returns
  {
    app: <Generic Swap Server Application Object>
  }
*/
module.exports = args => {
  const app = express();

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

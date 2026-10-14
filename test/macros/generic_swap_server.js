const {createServer} = require('node:http');

const defaultMaxSwapInTokens = 30e6;
const defaultMaxSwapOutCltv = 400;
const defaultMaxSwapOutTokens = 30e6;
const defaultMinSwapInTokens = 250e3;
const defaultMinSwapOutCltv = 100;
const defaultMinSwapOutTokens = 250e3;
const defaultSwapInBaseFee = 5000;
const defaultSwapInCltv = 1000;
const defaultSwapInFeeRate = 1500;
const defaultSwapOutBaseFee = 500;
const defaultSwapOutDeposit = 30e3;
const defaultSwapOutFeeRate = 500;
const failureCode = 500;
const feeRateDenominator = BigInt(1e6);
const jsonHeaders = {'content-type': 'application/json'};
const methodNewSwapIn = 'newLoopInSwap';
const methodNewSwapOut = 'newLoopOutSwap';
const methodSwapInQuote = 'loopInQuote';
const methodSwapInTerms = 'loopInTerms';
const methodSwapOutPushPreimage = 'loopOutPushPreimage';
const methodSwapOutQuote = 'loopOutQuote';
const methodSwapOutTerms = 'loopOutTerms';
const notFoundCode = 404;
const okCode = 200;
const {parse} = JSON;
const path = method => `/v0/${method}`;
const pathForUrl = url => new URL(url, 'http://localhost').pathname;
const postMethod = 'POST';
const {stringify} = JSON;
const textHeaders = {'content-type': 'text/plain'};
const trailingSlash = /\/$/;

/** Create generic swap server

  {
    destination: <Destination Hex String>
    handle_swap_in: <Respond to Swap In Promise>
    handle_swap_out: <Respond to Swap Out Promise>
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
    app: <Generic Swap Server HTTP Server Object>
  }
*/
module.exports = args => {
  const routes = {
    // Create new swap in
    [path(methodNewSwapIn)]: async ({}) => {
      try {
        return await args.handle_swap_in({});
      } catch (err) {
        return err;
      }
    },

    // Create new swap out
    [path(methodNewSwapOut)]: async ({}) => {
      try {
        return await args.handle_swap_out({});
      } catch (err) {
        return err;
      }
    },

    // Get the price of a swap given the current fee configuration
    [path(methodSwapInQuote)]: async ({body}) => {
      const swapInBaseFee = args.swap_in_base_fee || defaultSwapInBaseFee;
      const swapInFeeRate = args.swap_in_fee_rate || defaultSwapInFeeRate;
      const tokens = Number(body.amt);

      const feeRate = BigInt(swapInFeeRate);

      const rate = BigInt(tokens) * feeRate / feeRateDenominator;

      return {
        cltv_delta: args.swap_in_cltv || defaultSwapInCltv,
        swap_fee: (swapInBaseFee + Number(rate)).toString(),
      };
    },

    // Get the limits of the swap given the current limits configuration
    [path(methodSwapInTerms)]: async ({}) => {
      return {
        max_swap_amount: args.max_swap_in_tokens || defaultMaxSwapInTokens,
        min_swap_amount: args.min_swap_in_tokens || defaultMinSwapInTokens,
      };
    },

    // Release the preimage to the server to take the swap out off-chain HTLC
    [path(methodSwapOutPushPreimage)]: async ({}) => ({}),

    // Get the price of a swap out given the current fee configuration
    [path(methodSwapOutQuote)]: async ({body}) => {
      const swapOutBaseFee = args.swap_out_base_fee || defaultSwapOutBaseFee;
      const swapOutFeeRate = args.swap_out_fee_rate || defaultSwapOutFeeRate;
      const tokens = Number(body.amt);

      const feeRate = BigInt(swapOutFeeRate);

      const rate = BigInt(tokens) * feeRate / feeRateDenominator;

      return {
        prepay_amt: args.swap_out_deposit || defaultSwapOutDeposit,
        swap_fee: (swapOutBaseFee + Number(rate)).toString(),
        swap_payment_dest: args.destination,
      };
    },

    // Get the limits of swap outs based on the current configuration
    [path(methodSwapOutTerms)]: async ({}) => {
      return {
        max_cltv_delta: args.max_swap_out_cltv || defaultMaxSwapOutCltv,
        max_swap_amount: args.max_swap_out_tokens || defaultMaxSwapOutTokens,
        min_cltv_delta: args.min_swap_out_cltv || defaultMinSwapOutCltv,
        min_swap_amount: args.min_swap_out_tokens || defaultMinSwapOutTokens,
      };
    },
  };

  const app = createServer((req, res) => {
    const chunks = [];

    req.on('data', chunk => chunks.push(chunk));

    req.on('end', async () => {
      // Requests may end in a slash
      const route = routes[pathForUrl(req.url).replace(trailingSlash, '')];

      // Exit early when there is no method for the request
      if (req.method !== postMethod || !route) {
        res.writeHead(notFoundCode, textHeaders);

        return res.end(`Cannot ${req.method} ${req.url}`);
      }

      try {
        const json = Buffer.concat(chunks).toString();

        const response = await route({body: !json ? {} : parse(json)});

        res.writeHead(okCode, jsonHeaders);

        return res.end(stringify(response));
      } catch (err) {
        res.writeHead(failureCode, textHeaders);

        return res.end(err.message);
      }
    });
  });

  return {app};
};

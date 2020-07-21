const asyncAuto = require('async/auto');
const {Metadata} = require('grpc');
const {returnResult} = require('asyncjs-util');

const {protocolVersion} = require('./conf/swap_service');

const authHeader = 'Authorization';
const msPerSec = 1e3;
const {round} = Math;

/** Get swap quote from swap service

  Obtain CLTV delta for `timeout` by getting swap terms

  {
    [delay]: <Delay Swap Funding Until ISO 8601 Date String>
    [macaroon]: <Base64 Encoded Macaroon String>
    [preimage]: <Authentication Preimage Hex String>
    service: <Swap Service Object>
    timeout: <Timeout Height Number>
    tokens: <Tokens Number>
  }

  @returns via cbk or Promise
  {
    cltv_delta: <CLTV Delta Number>
    deposit: <Deposit Tokens Number>
    destination: <Destination Public Key Hex String>
    fee: <Total Fee Tokens Number>
  }
*/
module.exports = (args, cbk) => {
  return new Promise((resolve, reject) => {
    return asyncAuto({
      // Check arguments
      validate: cbk => {
        if (!args.service || !args.service.loopOutQuote) {
          return cbk([400, 'ExpectedServiceToGetSwapOutQuote']);
        }

        if (!args.timeout) {
          return cbk([400, 'ExpectedTimeoutToGetSwapOutQuote']);
        }

        if (!args.tokens) {
          return cbk([400, 'ExpectedTokensToGetSwapOutQuote']);
        }

        return cbk();
      },

      // Swap publication deadline
      deadline: ['validate', ({}, cbk) => {
        if (!args.delay) {
          return cbk();
        }

        const epochMs = new Date(args.delay).getTime();

        return cbk(null, round(epochMs / msPerSec).toString());
      }],

      // Get quote
      getQuote: ['deadline', ({deadline}, cbk) => {
        const metadata = new Metadata();

        if (!!args.macaroon) {
          metadata.add(authHeader, `LSAT ${args.macaroon}:${args.preimage}`);
        }

        return args.service.loopOutQuote({
          amt: args.tokens.toString(),
          expiry: args.timeout || undefined,
          protocol_version: protocolVersion,
          swap_publication_deadline: deadline,
          timeout: args.timeout,
        },
        metadata,
        (err, res) => {
          if (!!err) {
            return cbk([503, 'UnexpectedErrorGettingSwapQuote', {err}]);
          }

          if (!res) {
            return cbk([503, 'ExpectedResponseWhenGettingSwapQuote']);
          }

          return cbk(null, res);
        });
      }],

      // Loop out quote
      quote: ['getQuote', ({getQuote}, cbk) => {
        if (!getQuote.cltv_delta) {
          return cbk([503, 'ExpectedCltvDeltaInSwapQuoteResponse']);
        }

        if (!getQuote.prepay_amt) {
          return cbk([503, 'ExpectedPrepayAmountInSwapQuoteResponse']);
        }

        if (!getQuote.swap_fee) {
          return cbk([503, 'ExpectedSwapFeeAmountInSwapQuoteResponse']);
        }

        if (!getQuote.swap_payment_dest) {
          return cbk([503, 'ExpectedSwapPaymentDestinationPublicKey']);
        }

        return cbk(null, {
          cltv_delta: getQuote.cltv_delta,
          deposit: Number(getQuote.prepay_amt),
          destination: getQuote.swap_payment_dest,
          fee: Number(getQuote.swap_fee),
        });
      }],
    },
    returnResult({reject, resolve, of: 'quote'}, cbk));
  });
};

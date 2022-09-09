const asyncAuto = require('async/auto');
const {returnResult} = require('asyncjs-util');

const {protocolVersion} = require('./conf/swap_service');

const msPerSec = 1e3;
const {round} = Math;

/** Get swap quote from swap service

  Obtain CLTV delta for `timeout` by getting swap terms

  {
    [delay]: <Delay Swap Funding Until ISO 8601 Date String>
    metadata: <Authentication Metadata Object>
    service: <Swap Service Object>
    timeout: <Timeout Height Number>
    tokens: <Tokens Number>
  }

  @returns via cbk or Promise
  {
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
        if (!args.metadata) {
          return cbk([400, 'ExpectedAuthenticationMetadataToGetSwapOutQuote']);
        }

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
        return args.service.loopOutQuote({
          amt: args.tokens.toString(),
          expiry: args.timeout,
          protocol_version: protocolVersion,
          swap_publication_deadline: deadline,
        },
        args.metadata,
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
          deposit: Number(getQuote.prepay_amt),
          destination: getQuote.swap_payment_dest,
          fee: Number(getQuote.swap_fee),
        });
      }],
    },
    returnResult({reject, resolve, of: 'quote'}, cbk));
  });
};

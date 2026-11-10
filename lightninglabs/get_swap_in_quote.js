const asyncAuto = require('async/auto');
const {returnResult} = require('asyncjs-util');

const {protocolVersion} = require('./conf/swap_service');

const {isInteger} = Number;

/** Get swap in quote from swap service

  {
    [utxos_count]: <Shared Utxos Count Number>
    [is_fast]: <Request Fast Swap In Bool>
    metadata: <Authentication Metadata Object>
    service: <Swap Service Object>
    tokens: <Tokens to Swap Number>
  }

  @returns via cbk or Promise
  {
    cltv_delta: <CLTV Delta Number>
    fee: <Total Fee Tokens Number>
  }
*/
module.exports = (args, cbk) => {
  return new Promise((resolve, reject) => {
    return asyncAuto({
      // Check arguments
      validate: cbk => {
        const utxosCount = args.utxos_count;

        if (utxosCount !== undefined && !isInteger(utxosCount)) {
          return cbk([400, 'ExpectedUtxosCountNumberToGetSwapInQuote']);
        }

        if (utxosCount !== undefined && utxosCount < 1) {
          return cbk([400, 'ExpectedPositiveUtxosCountToGetSwapInQuote']);
        }

        if (!args.metadata) {
          return cbk([400, 'ExpectedAuthenticationMetadataToGetSwapInQuote']);
        }

        if (!args.service || !args.service.loopInQuote) {
          return cbk([400, 'ExpectedServiceToGetSwapInQuote']);
        }

        if (!args.tokens) {
          return cbk([400, 'ExpectedTokensAmountToGetSwapInQuote']);
        }

        return cbk();
      },

      // Get quote
      getQuote: ['validate', ({}, cbk) => {
        return args.service.loopInQuote({
          amt: args.tokens.toString(),
          fast: args.is_fast || undefined,
          num_static_address_deposits: args.utxos_count || undefined,
          protocol_version: protocolVersion,
        },
        args.metadata,
        (err, res) => {
          if (!!err) {
            return cbk([503, 'UnexpectedErrorGettingSwapInQuote', {err}]);
          }

          if (!res) {
            return cbk([503, 'ExpectedResponseWhenGettingSwapInQuote']);
          }

          return cbk(null, {
            cltv_delta: res.cltv_delta,
            swap_fee: res.swap_fee,
          });
        });
      }],

      // Loop In Quote
      quote: ['getQuote', ({getQuote}, cbk) => {
        if (getQuote.cltv_delta === undefined) {
          return cbk([503, 'ExpectedCltvDeltaInSwapInQuoteResponse']);
        }

        if (!getQuote.swap_fee) {
          return cbk([503, 'ExpectedSwapFeeBaseRateInSwapInQuoteResponse']);
        }

        return cbk(null, {
          cltv_delta: getQuote.cltv_delta,
          fee: Number(getQuote.swap_fee),
        });
      }],
    },
    returnResult({reject, resolve, of: 'quote'}, cbk));
  });
};

const asyncAuto = require('async/auto');
const {parsePaymentRequest} = require('ln-service');
const {returnResult} = require('asyncjs-util');

const {taprootVersion} = require('./conf/swap_service');

const asKey = n => Buffer.from(n.toString('base64'), 'base64');
const bufferAsHex = buffer => buffer.toString('hex');
const defaultUserAgent = 'nodejs';
const hexAsBuffer = hex => Buffer.from(hex, 'hex');
const msPerSec = 1e3;
const paymentRequiredError = 'payment required';
const {round} = Math;

/** Create a Taproot swap out request

  Get the `timeout` value by getting swap out terms to determine a CLTV delta

  {
    fund_at: <Request Funding On-Chain Before ISO 8601 Date String>
    hash: <Swap Hash String>
    metadata: <Authentication Metadata Object>
    network: <Network Name String>
    public_key: <Public Key Hex String>
    service: <gRPC Swap Service Object>
    timeout: <Requested Timeout Height Number>
    tokens: <Swap Tokens Number>
    [user_agent]: <User Agent String>
  }

  @returns via cbk or Promise
  {
    service_public_key: <Service Public Key Hex String>
    swap_execute_request: <Execute Swap Payment Request String>
    swap_fund_request: <Swap Funding Payment Request String>
  }
*/
module.exports = (args, cbk) => {
  return new Promise((resolve, reject) => {
    return asyncAuto({
      // Check arguments
      validate: cbk => {
        if (!args.fund_at) {
          return cbk([400, 'ExpectedFundAtDateToCreateTaprootSwapOut']);
        }

        if (!args.hash) {
          return cbk([400, 'ExpectedSwapHashToCreateTaprootSwapOut']);
        }

        if (!args.metadata) {
          return cbk([400, 'ExpectedAuthMetadataToCreateTaprootSwapOut']);
        }

        if (!args.network) {
          return cbk([400, 'ExpectedNetworkToCreateTaprootSwapOut']);
        }

        if (!args.public_key) {
          return cbk([400, 'ExpectedPublicKeyToCreateTaprootSwapOut']);
        }

        if (!args.service || !args.service.newLoopOutSwap) {
          return cbk([400, 'ExpectedServiceToCreateTaprootSwap']);
        }

        if (!args.timeout) {
          return cbk([400, 'ExpectedSwapServerTimeoutHeightToCreateSwapOut']);
        }

        if (!args.tokens) {
          return cbk([400, 'ExpectedTokensToCreateSwap']);
        }

        return cbk();
      },

      // Create the swap
      create: ['validate', ({}, cbk) => {
        const deadline = round(new Date(args.fund_at).getTime() / msPerSec);

        return args.service.newLoopOutSwap({
          amt: args.tokens.toString(),
          expiry: args.timeout,
          protocol_version: taprootVersion,
          receiver_key: hexAsBuffer(args.public_key),
          swap_hash: hexAsBuffer(args.hash),
          swap_publication_deadline: deadline.toString(),
          user_agent: args.user_agent || defaultUserAgent,
        },
        args.metadata,
        (err, res) => {
          // Exit early when the service requires a macaroon
          if (!!err && err.details === paymentRequiredError) {
            return cbk([402, 'PaymentRequiredToCreateTaprootSwap']);
          }

          if (!!err) {
            return cbk([503, 'UnexpectedErrorCreatingTaprootSwap', {err}]);
          }

          if (!res) {
            return cbk([503, 'ExpectedResponseWhenCreatingTaprootSwap']);
          }

          if (!res.prepay_invoice) {
            return cbk([503, 'ExpectedPrepayInvoiceInTaprootSwapResponse']);
          }

          try {
            parsePaymentRequest({request: res.prepay_invoice});
          } catch (err) {
            return cbk([503, 'FailedToParseSwapDepositRequestInSwap', {err}]);
          }

          if (!res.swap_invoice) {
            return cbk([503, 'ExpectedSwapInvoiceInTaprootSwapResponse']);
          }

          try {
            parsePaymentRequest({request: res.swap_invoice});
          } catch (err) {
            return cbk([503, 'FailedToParseSwapInvoiceInTaprootSwap', {err}]);
          }

          const {id} = parsePaymentRequest({request: res.swap_invoice});

          if (id !== args.hash) {
            return cbk([503, 'ExpectedFundingRequestToTaprootSwapHash']);
          }

          if (!res.sender_key) {
            return cbk([503, 'ExpectedPubKeyInTaprootSwapCreationResponse']);
          }

          return cbk(null, {
            service_public_key: bufferAsHex(asKey(res.sender_key)),
            swap_execute_request: res.prepay_invoice,
            swap_fund_request: res.swap_invoice,
          });
        });
      }],
    },
    returnResult({reject, resolve, of: 'create'}, cbk));
  });
};

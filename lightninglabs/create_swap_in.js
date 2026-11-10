const asyncAuto = require('async/auto');
const asyncify = require('async/asyncify');
const asyncReflect = require('async/reflect');
const {isPointCompressed} = require('tiny-secp256k1');
const {parsePaymentRequest} = require('ln-service');
const {returnResult} = require('asyncjs-util');

const cancelSwapIn = require('./cancel_swap_in');
const checkSwapInFallback = require('./check_swap_in_fallback');
const {getPublicKey} = require('./../script');
const {makePrivateKey} = require('./../script');
const {requestNetworks} = require('./conf/swap_service');
const {sharedAddressProtocolVersion} = require('./conf/swap_service');
const {swapInFallbacks} = require('./conf/swap_service');
const swapInFallbackScript = require('./swap_in_fallback_script');
const {swapInPaymentTimeoutSeconds} = require('./conf/swap_service');

const asBuffer = n => Buffer.from(n.toString('base64'), 'base64');
const bufferAsHex = buffer => buffer.toString('hex');
const defaultUserAgent = 'nodejs';
const dustTokens = 330;
const hexAsBuffer = hex => Buffer.from(hex, 'hex');
const {isArray} = Array;
const isHash = n => !!n && /^[0-9A-F]{64}$/i.test(n);
const isHexKey = n => !!n && /^[0-9A-F]{66}$/i.test(n);
const {isInteger} = Number;
const {isSafeInteger} = Number;
const maxPaymentTimeoutSeconds = 0xffffffff;
const maxVout = 4294967295;
const outpoint = n => `${n.transaction_id}:${n.transaction_vout}`;
const paymentRequiredError = 'payment required';

/** Create a swap in

  Sign the HTLCs with `signSwapInServiceFallback` right away or it is canceled

  {
    utxos: [{
      tokens: <Utxo Tokens Number>
      transaction_id: <Utxo Transaction Id Hex String>
      transaction_vout: <Utxo Transaction Output Index Number>
    }]
    fee: <Swap Service Fee Tokens Number>
    [in_through]: <Request Payment In Through Peer With Public Key Hex String>
    [is_fast]: <Request Fast Swap In Bool>
    max_timeout_height: <Maximum HTLC Timeout Height Number>
    metadata: <Authentication Metadata Object>
    [payment_timeout_seconds]: <Service Payment Deadline Seconds Number>
    [private_key]: <HTLC Refund Private Key Hex String>
    [public_key]: <HTLC Refund Public Key Hex String>
    request: <BOLT 11 Payment Request String>
    service: <Swap Service Object>
    [user_agent]: <User Agent String>
  }

  @returns via cbk or Promise
  {
    address: <Swap HTLC Chain Address String>
    fallbacks: [{
      fee: <Fallback Transaction Fee Tokens Number>
      fee_tokens_per_kw: <Fee Tokens Per Thousand Weight Units Number>
      nonces: [<Service MuSig2 Public Nonce For Utxo Hex String>]
      type: <Fallback Fee Rate Type String>
    }]
    id: <Swap Hash Hex String>
    [private_key]: <HTLC Refund Private Key Hex String>
    script: <Swap HTLC Witness Script Hex String>
    service_public_key: <Service HTLC Public Key Hex String>
    timeout: <Swap HTLC Timeout Height Number>
    tokens: <Swap Tokens Number>
  }
*/
module.exports = (args, cbk) => {
  return new Promise((resolve, reject) => {
    return asyncAuto({
      // Check arguments
      validate: cbk => {
        // A utxo has a transaction id, an output index and a value
        const isUtxo = utxo => {
          if (!utxo || !isHash(utxo.transaction_id)) {
            return false;
          }

          const vout = utxo.transaction_vout;

          if (!isInteger(vout) || vout < 0 || vout > maxVout) {
            return false;
          }

          return isSafeInteger(utxo.tokens) && utxo.tokens > 0;
        };

        if (!isArray(args.utxos) || !args.utxos.length) {
          return cbk([400, 'ExpectedUtxosToCreateSwapIn']);
        }

        if (args.utxos.some(utxo => !isUtxo(utxo))) {
          return cbk([400, 'ExpectedValidUtxosToCreateSwapIn']);
        }

        const outpoints = args.utxos.map(n => outpoint(n).toLowerCase());

        if (new Set(outpoints).size !== outpoints.length) {
          return cbk([400, 'ExpectedUniqueUtxosToCreateSwapIn']);
        }

        if (!isSafeInteger(args.fee) || args.fee < 0) {
          return cbk([400, 'ExpectedFeeToCreateSwapIn']);
        }

        if (!!args.in_through && !isHexKey(args.in_through)) {
          return cbk([400, 'ExpectedInThroughPublicKeyForSwapIn']);
        }

        if (!isInteger(args.max_timeout_height)) {
          return cbk([400, 'ExpectedMaxTimeoutHeightToCreateSwapIn']);
        }

        if (!args.metadata) {
          return cbk([400, 'ExpectedAuthMetadataToCreateSwapIn']);
        }

        const timeout = args.payment_timeout_seconds;

        if (timeout !== undefined && !isInteger(timeout)) {
          return cbk([400, 'ExpectedPaymentTimeoutSecondsForSwapIn']);
        }

        if (timeout !== undefined && timeout < 1) {
          return cbk([400, 'ExpectedPaymentTimeoutSecondsForSwapIn']);
        }

        if (timeout > maxPaymentTimeoutSeconds) {
          return cbk([400, 'ExpectedLowerPaymentTimeoutForSwapIn']);
        }

        // The refund public key is optional, a private key can be used instead
        const hasKey = !!args.public_key;

        if (hasKey && !isHexKey(args.public_key)) {
          return cbk([400, 'ExpectedValidPublicKeyToCreateSwapIn']);
        }

        if (hasKey && !isPointCompressed(hexAsBuffer(args.public_key))) {
          return cbk([400, 'ExpectedValidPublicKeyToCreateSwapIn']);
        }

        if (!args.request) {
          return cbk([400, 'ExpectedPaymentRequestToCreateSwapIn']);
        }

        if (!args.service || !args.service.serverStaticAddressLoopIn) {
          return cbk([400, 'ExpectedServiceToCreateSwapIn']);
        }

        if (!args.service.pushStaticAddressHtlcSigs) {
          return cbk([400, 'ExpectedServiceToCreateSwapIn']);
        }

        return cbk();
      },

      // Utxo outpoints to swap, the transaction ids are lowercased
      outpoints: ['validate', ({}, cbk) => {
        return cbk(null, args.utxos.map(n => outpoint(n).toLowerCase()));
      }],

      // HTLC refund keys
      keys: ['validate', asyncify(({}) => {
        // Exit early when the refund key is a public key
        if (!!args.public_key) {
          return {public_key: args.public_key.toLowerCase()};
        }

        const privateKey = args.private_key || makePrivateKey({}).private_key;

        try {
          const swapKey = getPublicKey({private_key: privateKey});

          return {private_key: privateKey, public_key: swapKey.public_key};
        } catch (err) {
          throw [400, 'ExpectedValidPrivateKeyToCreateSwapIn'];
        }
      })],

      // Decode the payment request
      parsedRequest: ['validate', asyncify(({}) => {
        try {
          return parsePaymentRequest({request: args.request});
        } catch (err) {
          throw [400, 'ExpectedValidRequestToCreateSwapIn', {err}];
        }
      })],

      // Determine the swap amount and change from the request and utxos
      swap: ['parsedRequest', ({parsedRequest}, cbk) => {
        if (!requestNetworks[parsedRequest.network]) {
          return cbk([400, 'ExpectedKnownNetworkForSwapInRequest']);
        }

        if (!parsedRequest.tokens) {
          return cbk([400, 'ExpectedRequestTokensToCreateSwapIn']);
        }

        const tokens = parsedRequest.tokens + args.fee;

        const total = args.utxos.reduce((sum, n) => sum + n.tokens, 0);

        const change = total - tokens;

        if (change < 0) {
          return cbk([400, 'ExpectedUtxosToCoverSwapInTokens']);
        }

        // Change goes back to the shared address so it cannot be dust
        if (!!change && change < dustTokens) {
          return cbk([400, 'ExpectedNonDustChangeForSwapIn', {change}]);
        }

        return cbk(null, {
          change,
          tokens,
          id: parsedRequest.id,
          network: requestNetworks[parsedRequest.network],
        });
      }],

      // Create the swap
      create: ['keys', 'outpoints', 'swap', ({keys, outpoints, swap}, cbk) => {
        const defaultTimeout = swapInPaymentTimeoutSeconds;
        const lastHop = args.in_through;
        const timeout = args.payment_timeout_seconds;

        return args.service.serverStaticAddressLoopIn({
          amount: !!swap.change ? swap.tokens.toString() : undefined,
          deposit_outpoints: outpoints,
          fast: args.is_fast || undefined,
          htlc_client_pub_key: hexAsBuffer(keys.public_key),
          last_hop: !lastHop ? undefined : hexAsBuffer(lastHop),
          payment_timeout_seconds: timeout || defaultTimeout,
          protocol_version: sharedAddressProtocolVersion,
          swap_hash: hexAsBuffer(swap.id),
          swap_invoice: args.request,
          user_agent: args.user_agent || defaultUserAgent,
        },
        args.metadata,
        (err, res) => {
          // Exit early when the service requires a paid macaroon
          if (!!err && err.details === paymentRequiredError) {
            return cbk([402, 'PaymentRequiredToCreateSwapIn']);
          }

          if (!!err) {
            return cbk([503, 'UnexpectedErrorCreatingSwapIn', {err}]);
          }

          if (!res) {
            return cbk([503, 'ExpectedResponseWhenCreatingSwapIn']);
          }

          return cbk(null, res);
        });
      }],

      // Check the details of the created swap
      check: [
        'create',
        'keys',
        'swap',
        asyncReflect(({create, keys, swap}, cbk) =>
      {
        if (!create.htlc_server_pub_key) {
          return cbk([503, 'ExpectedServerHtlcKeyForSwapIn']);
        }

        const serverKey = asBuffer(create.htlc_server_pub_key);

        if (!isPointCompressed(serverKey)) {
          return cbk([503, 'ExpectedValidServerHtlcKeyForSwapIn']);
        }

        if (!isInteger(create.htlc_expiry) || create.htlc_expiry < 1) {
          return cbk([503, 'ExpectedHtlcTimeoutForSwapIn']);
        }

        if (create.htlc_expiry > args.max_timeout_height) {
          return cbk([503, 'ExpectedLowerHtlcTimeoutForSwapIn']);
        }

        // Check the signing details for every HTLC fee rate
        const fallbacks = swapInFallbacks.map(fallback => {
          return checkSwapInFallback({
            utxos_count: args.utxos.length,
            has_change: !!swap.change,
            is_backup: fallback.is_backup,
            signing: create[fallback.info],
            tokens: swap.tokens,
            type: fallback.type,
          });
        });

        const failure = fallbacks.find(n => !!n.error);

        if (!!failure) {
          return cbk(failure.error);
        }

        const fallback = swapInFallbackScript({
          claim_public_key: bufferAsHex(serverKey),
          hash: swap.id,
          network: swap.network,
          refund_public_key: keys.public_key,
          timeout: create.htlc_expiry,
        });

        if (!!fallback.err) {
          const {err} = fallback;

          return cbk([500, 'FailedToDeriveServiceFallbackScript', {err}]);
        }

        return cbk(null, {
          address: fallback.address,
          fallbacks: fallbacks.map(n => n.fallback),
          id: swap.id,
          private_key: keys.private_key,
          script: fallback.script,
          service_public_key: bufferAsHex(serverKey),
          timeout: create.htlc_expiry,
          tokens: swap.tokens,
        });
      })],

      // Cancel the swap when its details are not acceptable
      cancel: ['check', 'swap', ({check, swap}, cbk) => {
        // Exit early when the swap details are acceptable
        if (!check.error) {
          return cbk();
        }

        // A failure to cancel is not returned, the original error is returned
        return cancelSwapIn({
          id: swap.id,
          metadata: args.metadata,
          service: args.service,
        },
        () => cbk(check.error));
      }],

      // Details of the swap
      details: ['cancel', 'check', ({check}, cbk) => {
        return cbk(null, check.value);
      }],
    },
    returnResult({reject, resolve, of: 'details'}, cbk));
  });
};

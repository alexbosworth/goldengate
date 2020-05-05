const {createHash} = require('crypto');
const {randomBytes} = require('crypto');

const asyncAuto = require('async/auto');
const {ECPair} = require('bitcoinjs-lib');
const {Metadata} = require('grpc');
const {parsePaymentRequest} = require('ln-service');
const {returnResult} = require('asyncjs-util');

const {addressForScript} = require('./../script');
const {protocolVersion} = require('./conf/swap_service');
const {swapScript} = require('./../script');

const alreadyCreatedError = 'contract already exists';
const authHeader = 'Authorization';
const bufFromHex = hex => Buffer.from(hex, 'hex');
const feeDivisor = 1e6;
const {isBuffer} = Buffer;
const networks = {bitcoin: 'btc', testnet: 'btctestnet'};
const pkLen = 33;
const preimageLen = 32;

/** Create a swap in

  {
    fee: <Fee Tokens Number>
    [in_through]: <Request Payment In Through Peer With Public Key Hex String>
    [macaroon]: <Base64 Encoded Macaroon String>
    max_timeout_height: <Max Timeout Height Number>
    [preimage]: <Authentication Preimage Hex String>
    [private_key]: <Refund Private Key Hex String>
    [public_key]: <Refund Public Key Hex String>
    request: <BOLT 11 Payment Request String>
    service: <gRPC Swap Service API Object>
  }

  @returns via cbk or Promise
  {
    address: <Swap Chain Address String>
    id: <Swap Preimage Hash Hex String>
    nested_address: <Swap P2SH Wrapped P2WSH Chain Address String>
    [private_key]: <Private Key Hex String>
    script: <Witness Script Hex String>
    service_public_key: <Service Public Key Hex String>
    timeout: <Swap Timeout Chain Height Number>
    tokens: <Tokens To Pay to Address Number>
  }
*/
module.exports = (args, cbk) => {
  return new Promise((resolve, reject) => {
    return asyncAuto({
      // Check arguments
      validate: cbk => {
        if (args.fee === undefined) {
          return cbk([400, 'ExpectedFeeToCreateSwapIn']);
        }

        if (!args.request) {
          return cbk([400, 'ExpectedPaymentRequestToCreateSwapIn']);
        }

        if (!args.service || !args.service.newLoopInSwap) {
          return cbk([400, 'ExpectedServiceToCreateSwapIn']);
        }

        return cbk();
      },

      // Keys
      keys: ['validate', ({}, cbk) => {
        const key = ECPair.makeRandom();

        const privateKey = args.private_key || key.privateKey.toString('hex');

        const swapKey = ECPair.fromPrivateKey(Buffer.from(privateKey, 'hex'));

        const publicKey = args.public_key || swapKey.publicKey.toString('hex');

        return cbk(null, {private_key: privateKey, public_key: publicKey});
      }],

      // Decode request
      parsedRequest: ['validate', ({}, cbk) => {
        try {
          const parsed = parsePaymentRequest({request: args.request});

          if (!networks[parsed.network]) {
            return cbk([400, 'ExpectedKnownNetworkForSwapInPaymentRequest']);
          }

          return cbk(null, {
            id: parsed.id,
            network: networks[parsed.network],
            tokens: parsed.tokens,
          });
        } catch (err) {
          return cbk([400, 'ExpectedValidPayReqToCreateSwapIn', {err}]);
        }
      }],

      // Create the swap
      create: ['keys', 'parsedRequest', ({keys, parsedRequest}, cbk) => {
        const metadata = new Metadata();

        if (!!args.macaroon) {
          metadata.add(authHeader, `LSAT ${args.macaroon}:${args.preimage}`);
        }

        return args.service.newLoopInSwap({
          amt: parsedRequest.tokens + args.fee,
          last_hop: !args.in_through ? undefined : bufFromHex(args.in_through),
          protocol_version: protocolVersion,
          sender_key: Buffer.from(keys.public_key, 'hex'),
          swap_hash: Buffer.from(parsedRequest.id, 'hex'),
          swap_invoice: args.request,
        },
        metadata,
        (err, res) => {
          if (!!err && err.details === alreadyCreatedError) {
            return cbk([400, 'SwapInAlreadyPreviouslyCreatedForThisHash']);
          }

          if (!!err) {
            return cbk([503, 'UnexpectedErrorCreatingSwapIn', {err}]);
          }

          if (!res) {
            return cbk([503, 'ExpectedResponseWhenCreatingSwapIn']);
          }

          if (!res.expiry) {
            return cbk([503, 'ExpectedExpiryHeightForCreatedSwapIn']);
          }

          if (res.expiry > args.max_timeout_height) {
            return cbk([503, 'ExpectedLowerExpiryHeightForCreatedSwapIn']);
          }

          const receiverKey = res.receiver_key;

          if (!isBuffer(receiverKey) || receiverKey.length !== pkLen) {
            return cbk([503, 'ExpectedReceiverKeyWhenCreatingSwapIn']);
          }

          return cbk(null, {
            service_public_key: res.receiver_key.toString('hex'),
            timeout: res.expiry,
          });
        });
      }],

      // Swap script. The server has the main pubkey, the client the refund key
      script: [
        'create',
        'keys',
        'parsedRequest',
        ({create, keys, parsedRequest}, cbk) =>
      {
        try {
          const {script} = swapScript({
            hash: parsedRequest.id,
            claim_public_key: create.service_public_key,
            refund_private_key: keys.private_key,
            timeout: create.timeout,
          });

          return cbk(null, script);
        } catch (err) {
          return cbk([500, 'FailedToDeriveSwapScriptWhenCreatingSwap', {err}]);
        }
      }],

      // Swap address
      address: ['parsedRequest', 'script', ({parsedRequest, script}, cbk) => {
        const {network} = parsedRequest;

        try {
          return cbk(null, addressForScript({network, script}));
        } catch (err) {
          return cbk([503, 'FailedToDeriveAddressFromOutputScript']);
        }
      }],

      // Final swap details
      swap: [
        'address',
        'create',
        'keys',
        'parsedRequest',
        'script',
        ({address, create, keys, parsedRequest, script}, cbk) =>
      {
        return cbk(null, {
          script,
          address: address.address,
          id: parsedRequest.id,
          nested_address: address.nested,
          private_key: !!args.public_key ? undefined : keys.private_key,
          service_public_key: create.service_public_key.toString('hex'),
          timeout: create.timeout,
          tokens: parsedRequest.tokens + args.fee,
        });
      }],
    },
    returnResult({reject, resolve, of: 'swap'}, cbk));
  });
};

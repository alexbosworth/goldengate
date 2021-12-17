const {createHash} = require('crypto');
const {randomBytes} = require('crypto');

const asyncAuto = require('async/auto');
const {ECPair} = require('ecpair');
const {parsePaymentRequest} = require('ln-service');
const {returnResult} = require('asyncjs-util');
const tinysecp = require('tiny-secp256k1');

const {addressForScript} = require('./../script');
const {protocolVersion} = require('./conf/swap_service');
const {swapScriptV2} = require('./../script');

const alreadyCreatedError = 'contract already exists';
const bufferize = n => Buffer.from(n.toString('base64'), 'base64');
const currentSwapScriptVersion = 2;
const bufFromHex = hex => Buffer.from(hex, 'hex');
const defaultUserAgent = 'nodejs';
const feeDivisor = 1e6;
const {isBuffer} = Buffer;
const networks = {bitcoin: 'btc', testnet: 'btctestnet'};
const pkLen = 33;

/** Create a swap in

  {
    fee: <Fee Tokens Number>
    [in_through]: <Request Payment In Through Peer With Public Key Hex String>
    max_timeout_height: <Max Timeout Height Number>
    metadata: <Authentication Metadata Object>
    [private_key]: <Refund Private Key Hex String>
    probe_request: <Probe Request String>
    [public_key]: <Refund Public Key Hex String>
    request: <BOLT 11 Payment Request String>
    service: <Swap Service API Object>
    [user_agent]: <User Agent String>
  }

  @returns via cbk or Promise
  {
    address: <Swap Chain Address String>
    id: <Swap Preimage Hash Hex String>
    nested_address: <Swap P2SH Wrapped P2WSH Chain Address String>
    [private_key]: <Private Key Hex String>
    script: <Witness Script Hex String>
    [service_message]: <Service Message String>
    service_public_key: <Service Public Key Hex String>
    timeout: <Swap Timeout Chain Height Number>
    tokens: <Tokens To Pay to Address Number>
    version: <Swap Script Version Number>
  }
*/
module.exports = (args, cbk) => {
  return new Promise((resolve, reject) => {
    return asyncAuto({
      // Import ECPair library
      ecp: async () => (await import('ecpair')).ECPairFactory(tinysecp),

      // Check arguments
      validate: cbk => {
        if (args.fee === undefined) {
          return cbk([400, 'ExpectedFeeToCreateSwapIn']);
        }

        if (!args.metadata) {
          return cbk([400, 'ExpectedAuthenticationMetadataToCreateSwapIn']);
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
      keys: ['ecp', 'validate', ({ecp}, cbk) => {
        const key = ecp.makeRandom();

        const privateKey = args.private_key || key.privateKey.toString('hex');

        const swapKey = ecp.fromPrivateKey(Buffer.from(privateKey, 'hex'));

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
        return args.service.newLoopInSwap({
          amt: (parsedRequest.tokens + args.fee).toString(),
          last_hop: !args.in_through ? undefined : bufFromHex(args.in_through),
          probe_invoice: args.probe_request,
          protocol_version: protocolVersion,
          sender_key: Buffer.from(keys.public_key, 'hex'),
          swap_hash: Buffer.from(parsedRequest.id, 'hex'),
          swap_invoice: args.request,
          user_agent: args.user_agent || defaultUserAgent,
        },
        args.metadata,
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

          if (!res.receiver_key) {
            return cbk([503, 'ExpectedReceiverKeyWhenCreatingSwapIn']);
          }

          const receiverKey = bufferize(res.receiver_key);

          if (receiverKey.length !== pkLen) {
            return cbk([503, 'ExpectedReceiverPublicKeyWhenCreatingSwapIn']);
          }

          return cbk(null, {
            service_message: res.server_message || undefined,
            service_public_key: receiverKey.toString('hex'),
            timeout: res.expiry,
          });
        });
      }],

      // Swap script. The server has the main pubkey, the client the refund key
      script: [
        'create',
        'ecp',
        'keys',
        'parsedRequest',
        ({create, ecp, keys, parsedRequest}, cbk) =>
      {
        try {
          const {script} = swapScriptV2({
            ecp,
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

      // Final swap details
      swap: [
        'create',
        'keys',
        'parsedRequest',
        'script',
        ({create, keys, parsedRequest, script}, cbk) =>
      {
        const {network} = parsedRequest;

        return cbk(null, {
          script,
          address: addressForScript({network, script}).address,
          id: parsedRequest.id,
          nested_address: addressForScript({network, script}).nested,
          private_key: !!args.public_key ? undefined : keys.private_key,
          service_message: create.service_message,
          service_public_key: create.service_public_key.toString('hex'),
          timeout: create.timeout,
          tokens: parsedRequest.tokens + args.fee,
          version: currentSwapScriptVersion,
        });
      }],
    },
    returnResult({reject, resolve, of: 'swap'}, cbk));
  });
};

const {createHash} = require('crypto');
const {randomBytes} = require('crypto');

const asyncAuto = require('async/auto');
const {ECPair} = require('bitcoinjs-lib');
const {Metadata} = require('grpc');
const {returnResult} = require('asyncjs-util');

const {addressForScript} = require('./../script');
const parsePaymentMetadata = require('./parse_payment_metadata');
const {protocolVersion} = require('./conf/swap_service');
const {swapScript} = require('./../script');

const authHeader = 'Authorization';
const msPerSec = 1e3;
const paymentRequiredError = 'payment required';
const preimageLen = 32;
const randomHex = byteLength => randomBytes(byteLength).toString('hex');
const {round} = Math;
const sha256 = preimage => createHash('sha256').update(preimage).digest('hex');

/** Create a swap out request

  {
    [fund_at]: <Request Funding On-Chain Before ISO 8601 Date String>
    [hash]: <Swap Hash String>
    [macaroon]: <Base64 Encoded Macaroon String>
    network: <Network Name String>
    [preimage]: <Authentication Preimage Hex String>
    [private_key]: <Private Key Hex String>
    [public_key]: <Public Key Hex String>
    [secret]: <Secret Hex String>
    service: <gRPC Swap Service Object>
    tokens: <Swap Tokens Number>
  }

  @returns via cbk or Promise
  {
    address: <Swap Chain Address String>
    [private_key]: <Claim Private Key Hex String>
    script: <Redeem Script Hex String>
    [secret]: <Swap Preimage Hex String>
    service_public_key: <Service Public Key Hex String>
    swap_execute_request: <Execute Swap Payment Request String>
    swap_fund_request: <Swap Funding Payment Request String>
    timeout: <Swap Timeout Chain Height Number>
  }
*/
module.exports = (args, cbk) => {
  return new Promise((resolve, reject) => {
    return asyncAuto({
      // Check arguments
      validate: cbk => {
        if (!!args.hash && !!args.secret) {
          return cbk([400, 'ExpectedOnlySwapHashOrSwapSecretNotBoth']);
        }

        if (!!args.macaroon && !args.preimage) {
          return cbk([400, 'ExpectedPreimageWhenMacaroonIsProvided']);
        }

        if (!args.network) {
          return cbk([400, 'ExpectedNetworkWhenCreatingSwap']);
        }

        if (!!args.private_key && !!args.public_key) {
          return cbk([400, 'ExpectedOnlyPrivateKeyOrPublicKeyNotBoth']);
        }

        if (!args.service || !args.service.newLoopOutSwap) {
          return cbk([400, 'ExpectedServiceToCreateSwap']);
        }

        if (!args.tokens) {
          return cbk([400, 'ExpectedTokensToCreateSwap']);
        }

        return cbk();
      },

      // Deadline for swap execution
      deadline: ['validate', ({}, cbk) => {
        if (!args.fund_at) {
          return cbk();
        }

        const epochMs = new Date(args.fund_at).getTime();

        return cbk(null, round(epochMs / msPerSec).toString());
      }],

      // Keys
      keys: ['validate', ({}, cbk) => {
        const key = ECPair.makeRandom();

        const privateKey = args.private_key || key.privateKey.toString('hex');
        const swapSecret = args.secret || randomHex(preimageLen);

        const preimage = Buffer.from(swapSecret, 'hex');
        const swapKey = ECPair.fromPrivateKey(Buffer.from(privateKey, 'hex'));

        const publicKey = args.public_key || swapKey.publicKey.toString('hex');
        const swapHash = args.hash || sha256(preimage);

        return cbk(null, {
          private_key: privateKey,
          public_key: publicKey,
          swap_hash: swapHash,
          swap_secret: swapSecret,
        });
      }],

      // Create the swap
      create: ['deadline', 'keys', ({deadline, keys}, cbk) => {
        const metadata = new Metadata();

        if (!!args.macaroon) {
          metadata.add(authHeader, `LSAT ${args.macaroon}:${args.preimage}`);
        }

        return args.service.newLoopOutSwap({
          amt: `${args.tokens}`,
          protocol_version: protocolVersion,
          receiver_key: Buffer.from(keys.public_key, 'hex'),
          swap_hash: Buffer.from(keys.swap_hash, 'hex'),
          swap_publication_deadline: deadline,
        },
        metadata,
        (err, res) => {
          // Exit early when the service requires a macaroon
          if (!!err && err.details === paymentRequiredError) {
            return cbk([402, 'PaymentRequiredToCreateSwap']);
          }

          // Exit early on an unanticipated error from the remote service
          if (!!err) {
            return cbk([503, 'UnexpectedErrorCreatingSwap', {err}]);
          }

          // Exit early when there is no response
          if (!res) {
            return cbk([503, 'ExpectedResponseWhenCreatingSwap']);
          }

          return cbk(null, {
            expiry: res.expiry,
            prepay_invoice: res.prepay_invoice,
            sender_key: res.sender_key,
            swap_invoice: res.swap_invoice,
          });
        });
      }],

      // Swap script
      script: ['create', 'keys', ({create, keys}, cbk) => {
        try {
          const {script} = swapScript({
            claim_private_key: keys.private_key,
            refund_public_key: create.sender_key.toString('hex'),
            secret: keys.swap_secret,
            timeout: create.expiry,
          });

          return cbk(null, script);
        } catch (err) {
          return cbk([500, 'FailedToDeriveSwapScriptWhenCreatingSwap', {err}]);
        }
      }],

      // Swap address
      address: ['script', ({script}, cbk) => {
        try {
          const {address} = addressForScript({script, network: args.network});

          return cbk(null, address);
        } catch (err) {
          return cbk([503, 'FailedToDeriveAddressFromOutputScript']);
        }
      }],

      // Final swap details
      swap: [
        'address',
        'create',
        'keys',
        'script',
        ({address, create, keys, script}, cbk) =>
      {
        if (!create.expiry) {
          return cbk([503, 'ExpectedExpiryHeightWhenCreatingSwap']);
        }

        if (!create.prepay_invoice) {
          return cbk([503, 'ExpectedPrepayInvoiceInSwapCreationResponse']);
        }

        if (!create.sender_key) {
          return cbk([503, 'ExpectedSenderKeyInSwapCreationResponse']);
        }

        if (!create.swap_invoice) {
          return cbk([503, 'ExpectedSwapInvoiceInSwapCreationResponse']);
        }

        return cbk(null, {
          address,
          script,
          private_key: !!args.public_key ? undefined : keys.private_key,
          protocol_version: protocolVersion,
          secret: !!args.hash ? undefined : keys.swap_secret,
          service_public_key: create.sender_key.toString('hex'),
          swap_execute_request: create.prepay_invoice,
          swap_fund_request: create.swap_invoice,
          timeout: create.expiry,
        });
      }],
    },
    returnResult({reject, resolve, of: 'swap'}, cbk));
  });
};

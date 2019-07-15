const {createHash} = require('crypto');
const {randomBytes} = require('crypto');

const asyncAuto = require('async/auto');
const {ECPair} = require('bitcoinjs-lib');
const {returnResult} = require('asyncjs-util');

const {swapAddress} = require('./../transactions');
const {swapScript} = require('./../transactions');

const preimageLen = 32;
const randomHex = byteLength => randomBytes(byteLength).toString('hex')
const sha256 = preimage => createHash('sha256').update(preimage).digest('hex');

/** Create a swap invoice

  {
    [hash]: <Swap Hash String>
    network: <Network Name String>
    [private_key]: <Private Key Hex String>
    [public_key]: <Public Key Hex String>
    [secret]: <Secret Hex String>
    service: <gRPC Swap Service Object>
    tokens: <Swap Tokens Number>
  }

  @returns via cbk
  {
    address: <Swap Chain Address String>
    [private_key]: <Private Key Hex String>
    script: <Redeem Script Hex String>
    [secret]: <Swap Preimage Hex String>
    service_public_key: <Service Public Key Hex String>
    swap_execute_request: <Execute Swap Payment Request>
    swap_fund_request: <Swap Funding Payment Request>
    timeout: <Swap Timeout Chain Height Number>
  }
*/
module.exports = (args, cbk) => {
  return asyncAuto({
    // Check arguments
    validate: cbk => {
      if (!!args.hash && !!args.secret) {
        return cbk([400, 'ExpectedOnlySwapHashOrSwapSecretNotBoth']);
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
    create: ['keys', ({keys}, cbk) => {
      return args.service.newLoopOutSwap({
        amt: `${args.tokens}`,
        receiver_key: Buffer.from(keys.public_key, 'hex'),
        swap_hash: Buffer.from(keys.swap_hash, 'hex'),
      },
      (err, res) => {
        if (!!err) {
          return cbk([503, 'UnexpectedErrorCreatingSwap', {err}]);
        }

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
          private_key: keys.private_key,
          secret: keys.swap_secret,
          service_public_key: create.sender_key.toString('hex'),
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
        return cbk(null, swapAddress({script, network: args.network}).address);
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
        secret: !!args.hash ? undefined : keys.swap_secret,
        service_public_key: create.sender_key.toString('hex'),
        swap_execute_request: create.prepay_invoice,
        swap_fund_request: create.swap_invoice,
        timeout: create.expiry,
      });
    }],
  },
  returnResult({of: 'swap'}, cbk));
};

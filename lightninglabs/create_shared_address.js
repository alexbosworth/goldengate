const asyncAuto = require('async/auto');
const {isPointCompressed} = require('tiny-secp256k1');
const {returnResult} = require('asyncjs-util');

const {maxSharedAddressExpiry} = require('./conf/swap_service');
const {names} = require('./../conf/networks');
const {sharedAddressProtocolVersion} = require('./conf/swap_service');

const deriveSharedAddress = require('./derive_shared_address');

const asKey = n => Buffer.from(n.toString('base64'), 'base64');
const bufferAsHex = buffer => buffer.toString('hex');
const hexAsBuffer = hex => Buffer.from(hex, 'hex');
const isHex = n => !!n && /^[0-9A-F]*$/i.test(n);
const {isInteger} = Number;
const paymentRequiredError = 'payment required';

/** Create a shared address with the swap service

  {
    [max_expiry]: <Max Client Timeout Path Blocks Count Number>
    metadata: <Authentication Metadata Object>
    network: <Network Name String>
    public_key: <Client Compressed Public Key Hex String>
    service: <Swap Service Object>
  }

  @returns via cbk or Promise
  {
    address: <Shared Address String>
    expiry: <Client Timeout Path Relative Timelock Blocks Count Number>
    service_public_key: <Service Public Key Hex String>
  }
*/
module.exports = (args, cbk) => {
  return new Promise((resolve, reject) => {
    return asyncAuto({
      // Check arguments
      validate: cbk => {
        // A caller can only lower the highest expiry that it takes
        const isMaxExpiry = isInteger(args.max_expiry) && args.max_expiry > 0;

        if (args.max_expiry !== undefined && !isMaxExpiry) {
          return cbk([400, 'ExpectedValidMaxExpiryToCreateSharedAddress']);
        }

        if (args.max_expiry > maxSharedAddressExpiry) {
          return cbk([400, 'ExpectedLowerMaxExpiryToCreateSharedAddress']);
        }

        if (!args.metadata) {
          return cbk([400, 'ExpectedAuthMetadataToCreateSharedAddress']);
        }

        if (!args.network || !names[args.network]) {
          return cbk([400, 'ExpectedKnownNetworkToCreateSharedAddress']);
        }

        if (!isHex(args.public_key)) {
          return cbk([400, 'ExpectedPublicKeyToCreateSharedAddress']);
        }

        if (!isPointCompressed(hexAsBuffer(args.public_key))) {
          return cbk([400, 'ExpectedCompressedPublicKeyToMakeSharedAddress']);
        }

        if (!args.service || !args.service.serverNewAddress) {
          return cbk([400, 'ExpectedServiceToCreateSharedAddress']);
        }

        return cbk();
      },

      // Register the client key with the service to get address parameters
      create: ['validate', ({}, cbk) => {
        return args.service.serverNewAddress({
          client_key: hexAsBuffer(args.public_key),
          protocol_version: sharedAddressProtocolVersion,
        },
        args.metadata,
        (err, res) => {
          // Exit early when the service requires a paid macaroon
          if (!!err && err.details === paymentRequiredError) {
            return cbk([402, 'PaymentRequiredToCreateSharedAddress']);
          }

          if (!!err) {
            return cbk([503, 'UnexpectedErrorCreatingSharedAddress', {err}]);
          }

          if (!res) {
            return cbk([503, 'ExpectedResponseWhenCreatingSharedAddress']);
          }

          if (!res.params) {
            return cbk([503, 'ExpectedParamsWhenCreatingSharedAddress']);
          }

          if (!res.params.server_key) {
            return cbk([503, 'ExpectedServerKeyWhenCreatingSharedAddress']);
          }

          const serverKey = asKey(res.params.server_key);

          if (!isPointCompressed(serverKey)) {
            return cbk([503, 'ExpectedCompressedServerKeyForSharedAddress']);
          }

          const {expiry} = res.params;

          if (!isInteger(expiry) || expiry < 1) {
            return cbk([503, 'ExpectedExpiryWhenCreatingSharedAddress']);
          }

          // The caller can lower the highest expiry from the default
          const maxExpiry = args.max_expiry || maxSharedAddressExpiry;

          // Avoid a timeout path that would lock up utxos for too long
          if (expiry > maxExpiry) {
            return cbk([503, 'ExpectedLowerExpiryWhenCreatingSharedAddress']);
          }

          return cbk(null, {
            expiry,
            service_public_key: bufferAsHex(serverKey),
          });
        });
      }],

      // Derive the shared address from the client and service keys
      address: ['create', ({create}, cbk) => {
        const derived = deriveSharedAddress({
          client_public_key: args.public_key,
          expiry: create.expiry,
          network: args.network,
          server_public_key: create.service_public_key,
        });

        if (!!derived.err) {
          return cbk([500, 'FailedToDeriveSharedAddress', {err: derived.err}]);
        }

        return cbk(null, {
          address: derived.address,
          expiry: create.expiry,
          service_public_key: create.service_public_key,
        });
      }],
    },
    returnResult({reject, resolve, of: 'address'}, cbk));
  });
};

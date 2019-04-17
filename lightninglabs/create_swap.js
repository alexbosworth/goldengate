const {createHash} = require('crypto');
const {randomBytes} = require('crypto');

const {ECPair} = require('bitcoinjs-lib');

const {getGrpcInterface} = require('./../grpc');

const preimageLen = 32;
const sha256 = preimage => createHash('sha256').update(preimage).digest('hex');

/** Create a swap invoice

  {
    [hash]: <Swap Hash String>
    [private_key]: <Private Key Hex String>
    [public_key]: <Public Key Hex String>
    [secret]: <Secret Hex String>
    socket: <Swap Service Socket String>
    tokens: <Swap Tokens Number>
  }

  @returns via cbk
  {
    [private_key]: <Private Key Hex String>
    [secret]: <Swap Preimage Hex String>
    service_public_key: <Service Public Key Hex String>
    swap_execute_request: <Execute Swap Payment Request>
    swap_fund_request: <Swap Funding Payment Request>
    timeout: <Swap Timeout Number>
  }
*/
module.exports = (args, cbk) => {
  if (!!args.hash && !!args.secret) {
    return cbk([400, 'ExpectedOnlySwapHashOrSwapSecretNotBoth']);
  }

  if (!!args.private_key && !!args.public_key) {
    return cbk([400, 'ExpectedOnlyPrivateKeyOrPublicKeyNotBoth']);
  }

  if (!args.socket) {
    return cbk([400, 'ExpectedSocketOfSwapServiceToCreateSwap']);
  }

  if (!args.tokens) {
    return cbk([400, 'ExpectedTokensToCreateSwap']);
  }

  const randomKey = ECPair.makeRandom();

  const {grpc} = getGrpcInterface({socket: args.socket});
  const privateKey = args.private_key || randomKey.privateKey.toString('hex');
  const swapSecret = args.secret || randomBytes(preimageLen).toString('hex');

  const preimage = Buffer.from(swapSecret, 'hex');
  const swapKey = ECPair.fromPrivateKey(Buffer.from(privateKey, 'hex'));

  const publicKey = args.public_key || swapKey.publicKey.toString('hex');
  const swapHash = args.hash || sha256(preimage);

  return grpc.newLoopOutSwap({
    amt: `${args.tokens}`,
    receiver_key: Buffer.from(publicKey, 'hex'),
    swap_hash: Buffer.from(swapHash, 'hex'),
  },
  (err, res) => {
    if (!!err) {
      return cbk([503, 'UnexpectedErrorCreatingSwap', err]);
    }

    if (!res) {
      return cbk([503, 'ExpectedResponseWhenCreatingSwap']);
    }

    if (!res.expiry) {
      return cbk([503, 'ExpectedExpiryHeightWhenCreatingSwap']);
    }

    if (!res.prepay_invoice) {
      return cbk([503, 'ExpectedPrepayInvoiceInSwapCreationResponse']);
    }

    if (!res.sender_key) {
      return cbk([503, 'ExpectedSenderKeyInSwapCreationResponse']);
    }

    if (!res.swap_invoice) {
      return cbk([503, 'ExpectedSwapInvoiceInSwapCreationResponse']);
    }

    return cbk(null, {
      private_key: !!args.public_key ? undefined : privateKey,
      secret: !!args.hash ? undefined : swapSecret,
      service_public_key: res.sender_key.toString('hex'),
      swap_execute_request: res.prepay_invoice,
      swap_fund_request: res.swap_invoice,
      timeout: res.expiry,
    });
  });
};

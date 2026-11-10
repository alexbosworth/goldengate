const {sharedAddressScript} = require('./../script');

/** Derive a shared address, returning an error instead of throwing

  {
    client_public_key: <Client Compressed Public Key Hex String>
    expiry: <Client Timeout Path Relative Timelock Blocks Count Number>
    network: <Network Name String>
    server_public_key: <Service Public Key Hex String>
  }

  @returns
  {
    [address]: <Shared Address String>
    [err]: <Error Object>
  }
*/
module.exports = args => {
  try {
    const {address} = sharedAddressScript({
      client_public_key: args.client_public_key,
      expiry: args.expiry,
      network: args.network,
      server_public_key: args.server_public_key,
    });

    return {address};
  } catch (err) {
    return {err};
  }
};

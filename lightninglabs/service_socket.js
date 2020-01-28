const {sockets} = require('./conf/swap_service');

/** Get service socket

  {
    [is_free]: <Use Free Service Endpoint Bool>
    network: <Network Name String>
  }

  @throws
  <Error>

  @returns
  {
    socket: <Service Socket String>
  }
*/
module.exports = args => {
  if (!args.network) {
    throw new Error('ExpectedNetworkNameForSwapServiceSocket');
  }

  if (!!args.is_free && !sockets.free[args.network]) {
    throw new Error('ExpectedKnownNetworkForServiceSocket');
  }

  // Exit early when using the free endpoint
  if (!!args.is_free) {
    return {socket: sockets.free[args.network]};
  }

  if (!sockets.paid[args.network]) {
    throw new Error('ExpectedKnownNetworkForServiceSocket');
  }

  return {socket: sockets.paid[args.network]};
};

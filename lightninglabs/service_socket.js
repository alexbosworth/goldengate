const {sockets} = require('./conf/swap_service');

/** Get service socket

  {
    network: <Network Name String>
  }

  @throws
  <Error>

  @returns
  {
    socket: <Service Socket String>
  }
*/
module.exports = ({network}) => {
  if (!network) {
    throw new Error('ExpectedNetworkNameForSwapServiceSocket');
  }

  if (!sockets[network]) {
    throw new Error('ExpectedKnownNetworkForServiceSocket');
  }

  return {socket: sockets[network]};
};

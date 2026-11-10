const {getGrpcInterface} = require('./../grpc');
const serviceSocket = require('./service_socket');

/** Lightning Labs swap service

  {
    [cert]: <Swap Service TLS Certificate Base64 or Hex Encoded String>
    [is_free]: <Use Free Service Endpoint Bool>
    network: <Network Name String>
    [socket]: <Custom Socket String>
  }

  @throws
  <Error>

  @returns
  {
    service: <Swap Service gRPC API Object>
  }
*/
module.exports = args => {
  // A custom socket is used directly, it can be for a network like regtest
  const {socket} = !!args.socket ? args : serviceSocket({
    is_free: args.is_free,
    network: args.network,
  });

  return {service: getGrpcInterface({socket, cert: args.cert}).grpc};
};

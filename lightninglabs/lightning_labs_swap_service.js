const {getGrpcInterface} = require('./../grpc');
const serviceSocket = require('./service_socket');

/** Lightning Labs swap service

  {
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
  const {socket} = serviceSocket({
    is_free: args.is_free,
    network: args.network,
  });

  return {service: getGrpcInterface({socket: args.socket || socket}).grpc};
};

const {getGrpcInterface} = require('./../grpc');
const serviceSocket = require('./service_socket');

/** Lightning Labs swap service

  {
    network: <Network Name String>
  }

  @throws
  <Error>

  @returns
  {
    service: <Swap Service gRPC API Object>
  }
*/
module.exports = ({network}) => {
  const {socket} = serviceSocket({network});

  return {service: getGrpcInterface({socket}).grpc};
};

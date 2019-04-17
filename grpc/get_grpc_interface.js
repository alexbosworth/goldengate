const {join} = require('path');

const grpc = require('grpc');
const {loadSync} = require('@grpc/proto-loader');

const {confDir} = require('./conf/grpc_config');
const {grpcSslCipherSuites} = require('./conf/grpc_config');
const {packageType} = require('./conf/grpc_config');
const {protoFile} = require('./conf/grpc_config');
const {serviceType} = require('./conf/grpc_config');

/** GRPC interface to remote swap server

  {
    socket: <Host:Port String>
  }

  @throws
  <Error>

  @returns
  {
    grpc: <GRPC API Object>
  }
*/
module.exports = ({socket}) => {
  if (!socket) {
    throw new Error('ExpectedGrpcIpOrDomainWithPortString');
  }

  const packageDefinition = loadSync(join(__dirname, confDir, protoFile), {
    defaults: true,
    enums: String,
    keepCase: true,
    longs: String,
    oneofs: true,
  });

  process.env.GRPC_SSL_CIPHER_SUITES = grpcSslCipherSuites;

  const rpc = grpc.loadPackageDefinition(packageDefinition);
  const ssl = grpc.credentials.createSsl();

  return {grpc: new rpc[packageType][serviceType](socket, ssl)};
};

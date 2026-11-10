const {join} = require('path');

const grpc = require('@grpc/grpc-js');
const {loadSync} = require('@grpc/proto-loader');

const {confDir} = require('./conf/grpc_config');
const {grpcSslCipherSuites} = require('./conf/grpc_config');
const {packageType} = require('./conf/grpc_config');
const {protoFiles} = require('./conf/grpc_config');
const {serviceName} = require('./conf/grpc_config');
const {serviceTypes} = require('./conf/grpc_config');

const isHex = n => !(n.length % 2) && /^[0-9A-F]*$/i.test(n);
const {keys} = Object;

/** GRPC interface to remote swap server

  {
    [cert]: <Server TLS Certificate Base64 or Hex Encoded String>
    socket: <Host:Port String>
  }

  @throws
  <Error>

  @returns
  {
    grpc: <GRPC API Object>
  }
*/
module.exports = ({cert, socket}) => {
  if (!socket) {
    throw new Error('ExpectedGrpcIpOrDomainWithPortString');
  }

  const protosDir = join(__dirname, confDir);

  const files = protoFiles.map(n => join(protosDir, n));

  const packageDefinition = loadSync(files, {
    defaults: true,
    enums: String,
    includeDirs: [protosDir],
    keepCase: true,
    longs: String,
    oneofs: true,
  });

  process.env.GRPC_SSL_CIPHER_SUITES = grpcSslCipherSuites;

  const rpc = grpc.loadPackageDefinition(packageDefinition);

  const encoding = !!cert && isHex(cert) ? 'hex' : 'base64';

  const certificate = !cert ? undefined : Buffer.from(cert, encoding);

  // A self-signed server certificate is trusted when it is passed
  const ssl = grpc.credentials.createSsl(certificate);

  // Collect the methods of all the services into a single service definition
  const methods = serviceTypes.reduce((sum, type) => {
    const {service} = rpc[packageType][type];

    keys(service).forEach(method => {
      if (!!sum[method]) {
        throw new Error('UnexpectedDuplicateMethodNameAcrossSwapServices');
      }

      return sum[method] = service[method];
    });

    return sum;
  },
  {});

  const Service = grpc.makeClientConstructor(methods, serviceName);

  return {grpc: new Service(socket, ssl)};
};

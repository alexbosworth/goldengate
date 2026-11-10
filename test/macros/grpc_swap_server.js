const {join} = require('node:path');

const grpc = require('@grpc/grpc-js');
const {loadSync} = require('@grpc/proto-loader');

const {confDir} = require('./../../grpc/conf/grpc_config');
const makeSelfSignedCert = require('./make_self_signed_cert');
const {packageType} = require('./../../grpc/conf/grpc_config');
const {protoFiles} = require('./../../grpc/conf/grpc_config');
const {serviceTypes} = require('./../../grpc/conf/grpc_config');

const host = 'localhost';
const {keys} = Object;
const protosDir = join(__dirname, '..', '..', 'grpc', confDir);
const randomPort = 0;

// A unary method responds with its result, or fails with its error
const unaryMethod = method => (call, cbk) => {
  return Promise.resolve()
    .then(() => method({metadata: call.metadata, request: call.request}))
    .then(res => cbk(null, res))
    .catch(err => cbk({code: grpc.status.INTERNAL, details: err.message}));
};

// The implementations of the methods of a service that the server has
const implementationFor = ({methods, service}) => {
  return keys(service).reduce((sum, name) => {
    const method = methods[service[name].originalName];

    // Exit early when the method is not implemented
    if (!method) {
      return sum;
    }

    // Stream methods write their responses to the call
    if (service[name].responseStream) {
      sum[name] = call => method({call, request: call.request});

      return sum;
    }

    sum[name] = unaryMethod(method);

    return sum;
  },
  {});
};

/** Start a swap service gRPC server that has a self-signed TLS certificate

  The server serves the swap service protos over TLS so that clients use their
  real gRPC interface to talk to it

  Methods are keyed by the method names that clients call, methods that are
  not passed are unimplemented

  {
    methods: {
      [method]: <Unary Method Function> ({metadata, request}) => <Response>
      [method]: <Server Stream Method Function> ({call, request}) => {}
    }
  }

  @returns via Promise
  {
    cert: <Base64 Encoded TLS Certificate String>
    socket: <Server Socket String>
    stop: <Stop Server Function> () => {}
  }
*/
module.exports = ({methods}) => {
  return new Promise((resolve, reject) => {
    const {cert, key} = makeSelfSignedCert({});

    const definition = loadSync(protoFiles.map(n => join(protosDir, n)), {
      defaults: true,
      enums: String,
      includeDirs: [protosDir],
      keepCase: true,
      longs: String,
      oneofs: true,
    });

    const rpc = grpc.loadPackageDefinition(definition);
    const server = new grpc.Server();

    // Add each swap service with the methods that the server implements
    serviceTypes.forEach(type => {
      const {service} = rpc[packageType][type];

      return server.addService(service, implementationFor({methods, service}));
    });

    const credentials = grpc.ServerCredentials.createSsl(
      null,
      [{cert_chain: Buffer.from(cert), private_key: Buffer.from(key)}],
      false
    );

    const address = `${host}:${randomPort}`;

    return server.bindAsync(address, credentials, (err, port) => {
      if (!!err) {
        return reject(err);
      }

      return resolve({
        cert: Buffer.from(cert).toString('base64'),
        socket: `${host}:${port}`,
        stop: () => server.forceShutdown(),
      });
    });
  });
};

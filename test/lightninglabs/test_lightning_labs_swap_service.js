const {deepEqual} = require('node:assert').strict;
const {join} = require('node:path');
const {rejects} = require('node:assert').strict;
const test = require('node:test');

const grpc = require('@grpc/grpc-js');
const {loadSync} = require('@grpc/proto-loader');

const {lightningLabsSwapService} = require('./../../lightninglabs');

const port = 2349;

const confDir = join(__dirname, '..', '..', 'grpc', 'conf');
const quote = {cltv_delta: 1000, swap_fee: '1000'};
const socket = `localhost:${port}`;
const timeoutMs = 5000;

// A self-signed TLS certificate for localhost, only used in tests
const cert = `-----BEGIN CERTIFICATE-----
MIIByDCCAW+gAwIBAgIUDYA5qqNiz27qONaZy8iaupSeMocwCgYIKoZIzj0EAwIw
LjEYMBYGA1UECgwPZ29sZGVuZ2F0ZSB0ZXN0MRIwEAYDVQQDDAlsb2NhbGhvc3Qw
IBcNMjYxMDIxMDExOTA3WhgPMjEyNjA5MjcwMTE5MDdaMC4xGDAWBgNVBAoMD2dv
bGRlbmdhdGUgdGVzdDESMBAGA1UEAwwJbG9jYWxob3N0MFkwEwYHKoZIzj0CAQYI
KoZIzj0DAQcDQgAE2VsMFNAMBB2HgSOoTn8x9TQOqVVBKWI6YC9VvEhxMslqqhwI
a5pREMQx/1DGcDjCPbbxcx2Vcl7nYYxH9jvBTqNpMGcwHQYDVR0OBBYEFC7sp9x3
CwfSyTAyEDuhyXx9UrO/MB8GA1UdIwQYMBaAFC7sp9x3CwfSyTAyEDuhyXx9UrO/
MA8GA1UdEwEB/wQFMAMBAf8wFAYDVR0RBA0wC4IJbG9jYWxob3N0MAoGCCqGSM49
BAMCA0cAMEQCIFJT9EcOrnglleyJ1SaFWt89V/wlgkJKvTzX5F7XFUjHAiBymkpo
a/vPOPCpF/A5c+FbcZabuSlEp4CqcLKwHf1RVw==
-----END CERTIFICATE-----
`;

const key = `-----BEGIN PRIVATE KEY-----
MIGHAgEAMBMGByqGSM49AgEGCCqGSM49AwEHBG0wawIBAQQgDxb4t6eD7svsA5nX
0BXU9bbbGnOzlWrGZvYxdJii7QuhRANCAATZWwwU0AwEHYeBI6hOfzH1NA6pVUEp
YjpgL1W8SHEyyWqqHAhrmlEQxDH/UMZwOMI9tvFzHZVyXudhjEf2O8FO
-----END PRIVATE KEY-----
`;

// Start a local swap service that uses the self-signed certificate
const startService = async () => {
  const definition = loadSync(join(confDir, 'server.proto'), {
    defaults: true,
    enums: String,
    includeDirs: [confDir],
    keepCase: true,
    longs: String,
    oneofs: true,
  });

  const rpc = grpc.loadPackageDefinition(definition);
  const server = new grpc.Server();

  server.addService(rpc.looprpc.SwapServer.service, {
    loopInQuote: ({request}, cbk) => {
      return cbk(null, {cltv_delta: 1000, swap_fee: request.amt / 100});
    },
  });

  const credentials = grpc.ServerCredentials.createSsl(null, [{
    cert_chain: Buffer.from(cert),
    private_key: Buffer.from(key),
  }]);

  await new Promise((resolve, reject) => {
    return server.bindAsync(socket, credentials, err => {
      return !!err ? reject(err) : resolve();
    });
  });

  return {server};
};

// Get a swap in quote from a service
const getQuote = service => new Promise((resolve, reject) => {
  const deadline = Date.now() + timeoutMs;

  return service.loopInQuote(
    {amt: '100000'},
    new grpc.Metadata(),
    {deadline},
    (err, res) => !!err ? reject(err) : resolve(res)
  );
});

// Get a quote with a swap service client from the local swap service
const quoteFrom = async args => {
  const {server} = await startService();

  try {
    const {service} = lightningLabsSwapService(args);

    const res = await getQuote(service).finally(() => service.close());

    return {cltv_delta: res.cltv_delta, swap_fee: res.swap_fee};
  } finally {
    server.forceShutdown();
  }
};

const tests = [
  {
    args: {
      socket,
      cert: Buffer.from(cert).toString('base64'),
      network: 'btc',
    },
    description: 'A custom socket is used over the default service socket',
    expected: quote,
  },
  {
    args: {
      socket,
      cert: Buffer.from(cert).toString('base64'),
      network: 'btcregtest',
    },
    description: 'Trust a self-signed service by base64 cert',
    expected: quote,
  },
  {
    args: {
      socket,
      cert: Buffer.from(cert).toString('hex'),
      network: 'btcregtest',
    },
    description: 'Trust a self-signed service by hex cert',
    expected: quote,
  },
  {
    args: {socket, network: 'btcregtest'},
    description: 'A self-signed service is not trusted without its cert',
    error: {code: grpc.status.UNAVAILABLE},
  },
  {
    args: {network: 'btcregtest'},
    description: 'A custom socket is needed for a network with no service',
    error: {message: 'ExpectedKnownNetworkForServiceSocket'},
  },
];

tests.forEach(({args, description, error, expected}) => {
  return test(description, async () => {
    if (!!error) {
      await rejects(quoteFrom(args), error, 'Got expected error');
    } else {
      deepEqual(await quoteFrom(args), expected, 'Got expected quote');
    }

    return;
  });
});

const {deepEqual} = require('node:assert').strict;
const test = require('node:test');
const {throws} = require('node:assert').strict;

const {getGrpcInterface} = require('./../../');

const methods = [
  'loopInQuote',
  'loopOutQuote',
  'newLoopInSwap',
  'newLoopOutSwap',
  'pushStaticAddressHtlcSigs',
  'pushStaticAddressSweeplessSigs',
  'serverNewAddress',
  'serverPsbtWithdrawDeposits',
  'serverStaticAddressLoopIn',
  'subscribeNotifications',
];

const newAddressRequest = {
  client_key: Buffer.alloc(33, 2),
  protocol_version: 'V0',
};

// The methods of the interface and a shared address request round trip
const grpcInterface = {
  new_address: newAddressRequest,
  paths: [
    '/looprpc.SwapServer/LoopInQuote',
    '/looprpc.SwapServer/LoopOutQuote',
    '/looprpc.SwapServer/NewLoopInSwap',
    '/looprpc.SwapServer/NewLoopOutSwap',
    '/looprpc.StaticAddressServer/PushStaticAddressHtlcSigs',
    '/looprpc.StaticAddressServer/PushStaticAddressSweeplessSigs',
    '/looprpc.StaticAddressServer/ServerNewAddress',
    '/looprpc.StaticAddressServer/ServerPsbtWithdrawDeposits',
    '/looprpc.StaticAddressServer/ServerStaticAddressLoopIn',
    '/looprpc.SwapServer/SubscribeNotifications',
  ],
  streams: ['/looprpc.SwapServer/SubscribeNotifications'],
};

// Get the method paths of an interface and send a request through it
const interfaceFor = args => {
  const {grpc} = getGrpcInterface(args);

  const {requestDeserialize, requestSerialize} = grpc.serverNewAddress;

  const serialized = requestSerialize(newAddressRequest);

  const streaming = methods.filter(n => grpc[n].responseStream);

  const description = {
    new_address: requestDeserialize(serialized),
    paths: methods.map(method => grpc[method].path),
    streams: streaming.map(n => grpc[n].path),
  };

  grpc.close();

  return description;
};

const tests = [
  {
    args: {socket: 'socket'},
    description: 'Get grpc interface',
    expected: grpcInterface,
  },
  {
    args: {cert: Buffer.from('cert').toString('base64'), socket: 'socket'},
    description: 'Get grpc interface for a server with a self-signed cert',
    expected: grpcInterface,
  },
  {
    args: {},
    description: 'No socket throws error',
    error: 'ExpectedGrpcIpOrDomainWithPortString',
  },
];

tests.forEach(({args, description, error, expected}) => {
  return test(description, (t, end) => {
    if (!!error) {
      throws(() => interfaceFor(args), new Error(error), 'Got expected error');
    } else {
      deepEqual(interfaceFor(args), expected, 'Got expected interface');
    }

    return end();
  });
});

const {deepEqual} = require('node:assert').strict;
const {rejects} = require('node:assert').strict;
const test = require('node:test');
const {throws} = require('node:assert').strict;

const {createSwapOut} = require('./../../');
const {genericSwapService} = require('./../../');
const {getSwapOutTerms} = require('./../../');

const metadata = {get: () => [String()]};

const fetch = () => new Promise((resolve, reject) => {
  return resolve({
    json: () => new Promise((resolve, reject) => {
      return resolve({
        max_cltv_delta: 1,
        max_swap_amount: '1',
        min_cltv_delta: 1,
        min_swap_amount: '1',
      });
    }),
    ok: true,
  });
});

const tests = [
  {
    args: {socket: 'socket'},
    description: 'A generic swap service requires a fetch function',
    error: 'ExpectedFetchFunctionForGenericSwapService'
  },
  {
    args: {fetch},
    description: 'A generic swap service requires a socket',
    error: 'ExpectedRemoteSocketForGenericSwapService'
  },
  {
    args: {fetch, socket: 'socket'},
    description: 'Generic swap service can be used to make swap requests',
    expected: {
      max_cltv_delta: 1,
      max_tokens: 1,
      min_cltv_delta: 1,
      min_tokens: 1,
    },
  },
];

tests.forEach(({args, description, error, expected}) => {
  return test(description, async () => {
    if (!!error) {
      throws(() => genericSwapService(args), new Error(error), 'Got error');
    } else {
      const {service} =  genericSwapService(args);

      const fail = genericSwapService({
        fetch: () => new Promise((resolve, reject) => reject('err')),
        socket: args.socket,
      });

      const failResponse = genericSwapService({
        fetch: () => new Promise((resolve, reject) => {
          return resolve({json: () => new Promise(resolve => resolve({}))});
        }),
        socket: args.socket
      });

      await rejects(createSwapOut({
        metadata,
        network: 'btctestnet',
        service: failResponse.service,
        timeout: 150,
        tokens: 100,
      }));

      await rejects(createSwapOut({
        metadata,
        network: 'btctestnet',
        service: fail.service,
        timeout: 150,
        tokens: 100,
      }));

      await getSwapOutTerms({
        metadata,
        service,
        macaroon: 'macaroon',
        preimage: 'preimage'
      });

      const quote = await getSwapOutTerms({metadata, service})

      deepEqual(quote, expected, 'got expected response');
    }

    return;
  });
});

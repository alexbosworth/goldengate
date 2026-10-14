const {deepEqual} = require('node:assert').strict;
const {rejects} = require('node:assert').strict;
const test = require('node:test');

const callService = require('./../../service/call_service');

const authenticate = ['LSAT macaroon="macaroon", invoice="invoice"'];

const request = {
  body: '{"amt":"1","swap_hash":"0101010101010101010101010101010101010101010101010101010101010101"}',
  headers: {
    authorization: 'authorization',
    'content-type': 'application/json',
  },
  method: 'POST',
  url: 'http://localhost/v0/method/',
};

const makeFetch = ({ok}) => {
  return (url, {body, headers, method}) => new Promise((resolve, reject) => {
    return resolve({
      ok,
      json: () => new Promise((resolve, reject) => {
        return resolve({authenticate, request: {body, headers, method, url}});
      }),
    });
  });
};

const makeArgs = overrides => {
  const args = {
    fetch: makeFetch({ok: true}),
    headers: {authorization: 'authorization'},
    method: 'method',
    parameters: {amt: '1', swap_hash: Buffer.alloc(32, 1)},
    socket: 'http://localhost',
    ver: 'v0',
  };

  Object.keys(overrides).forEach(k => args[k] = overrides[k]);

  return args;
};

const tests = [
  {
    args: makeArgs({}),
    description: 'Parameters are posted to the service as JSON',
    expected: {authenticate, request},
  },
  {
    args: makeArgs({fetch: makeFetch({ok: false})}),
    description: 'A failure response is passed back as an error',
    error: {authenticate, request},
  },
  {
    args: makeArgs({
      fetch: () => new Promise((resolve, reject) => reject(new Error('err'))),
    }),
    description: 'A fetch failure is passed back as an error',
    error: new Error('err'),
  },
];

tests.forEach(({args, description, error, expected}) => {
  return test(description, async () => {
    if (!!error) {
      await rejects(callService(args), error, 'Got expected error');
    } else {
      const res = await callService(args);

      deepEqual(res.metadata.get(), expected.authenticate, 'Got metadata');
      deepEqual(res.request, expected.request, 'Got expected request');
    }

    return;
  });
});

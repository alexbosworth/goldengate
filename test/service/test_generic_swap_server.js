const {equal} = require('node:assert').strict;
const test = require('node:test');

const {genericSwapServer} = require('./../macros');

const failedSwapIn = [503, 'FailedToCreateSwapIn'];
const failedSwapOut = [503, 'FailedToCreateSwapOut'];
const port = 2354;
const {stringify} = JSON;

const tests = [
  {
    args: {method: 'POST', path: '/v0/newLoopInSwap'},
    description: 'A swap in creation failure is returned as the response',
    expected: {body: stringify(failedSwapIn), status: 200},
  },
  {
    args: {method: 'POST', path: '/v0/newLoopOutSwap'},
    description: 'A swap out creation failure is returned as the response',
    expected: {body: stringify(failedSwapOut), status: 200},
  },
  {
    args: {method: 'POST', path: '/v0/unknownMethod'},
    description: 'An unknown method is not found',
    expected: {body: 'Cannot POST /v0/unknownMethod', status: 404},
  },
  {
    args: {method: 'GET', path: '/v0/loopInTerms'},
    description: 'A method is not found when it is not posted to',
    expected: {body: 'Cannot GET /v0/loopInTerms', status: 404},
  },
  {
    args: {body: 'invalid', method: 'POST', path: '/v0/loopInQuote'},
    description: 'An invalid request body is a server error',
    expected: {status: 500},
  },
];

const startSwapServer = ({app, port}) => new Promise((resolve, reject) => {
  let server;

  server = app.listen(port, () => resolve({server}));

  return;
});

const stopSwapServer = ({server}) => new Promise((resolve, reject) => {
  return server.close(() => resolve());
});

tests.forEach(({args, description, expected}) => {
  return test(description, async () => {
    const {app} = genericSwapServer({
      handle_swap_in: ({}) => new Promise((resolve, reject) => {
        return reject(failedSwapIn);
      }),
      handle_swap_out: ({}) => new Promise((resolve, reject) => {
        return reject(failedSwapOut);
      }),
    });

    const {server} = await startSwapServer({app, port});

    const res = await fetch(`http://localhost:${port}${args.path}`, {
      body: args.body,
      method: args.method,
    });

    equal(res.status, expected.status, 'Got expected status');

    if (!!expected.body) {
      equal(await res.text(), expected.body, 'Got expected body');
    }

    await stopSwapServer({server});

    return;
  });
});

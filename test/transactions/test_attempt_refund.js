const {ECPair} = require('bitcoinjs-lib');
const {test} = require('tap');
const {Transaction} = require('bitcoinjs-lib');

const {attemptRefund} = require('./../../');

const hash = Buffer.alloc(32).toString('hex');
const lnd = {};
const network = 'btctestnet';
const refund_private_key = Buffer.alloc(32).toString('hex');
const request = ({}, cbk) => cbk();
const service_public_key = Buffer.alloc(33).toString('hex');

const makeRequest = () => {
  return ({method, url}, cbk) => {
    if (/height/.test(url)) {
      return cbk(null, {statusCode: 200}, 200);
    }

    if (/address/.test(url)) {
      return cbk(null, {statusCode: 200}, [{
        status: {block_height: 200},
        txid: Buffer.alloc(32).toString('hex'),
        value: 1000,
        vout: 0,
      }]);
    }

    if (method === 'POST') {
      return cbk(null, {statusCode: 200}, 'txid');
    }

    return cbk();
  };
};

const tests = [
  {
    args: {},
    description: 'Refund requires swap hash',
    error: [400, 'ExpectedHashOfSwapToAttemptRefund'],
  },
  {
    args: {hash},
    description: 'Refund requires lnd',
    error: [400, 'ExpectedLndOrRequestToAttemptRefund'],
  },
  {
    args: {hash, lnd},
    description: 'Refund with lnd requires refund privkey',
    error: [400, 'ExpectedRefundPrivateKeyToAttemptRefund'],
  },
  {
    args: {hash, request},
    description: 'Refund with request requires network name',
    error: [400, 'ExpectedNetworkToAttemptRefund'],
  },
  {
    args: {hash, network, refund_private_key, request},
    description: 'Refund requires service public key',
    error: [400, 'ExpectedServicePublicKeyToAttemptRefund'],
  },
  {
    args: {hash, network, refund_private_key, request, service_public_key},
    description: 'Refund requires start height of swap',
    error: [400, 'ExpectedStartHeightToAttemptRefund'],
  },
  {
    args: {
      hash,
      network,
      refund_private_key,
      request,
      service_public_key,
      start_height: 1,
    },
    description: 'Refund requires sweep address to sweep funds out to',
    error: [400, 'ExpectedSweepAddressToAttemptRefund'],
  },
  {
    args: {
      hash,
      network,
      refund_private_key,
      request,
      service_public_key,
      start_height: 1,
      sweep_address: 'address',
    },
    description: 'Refund requires timeout height',
    error: [400, 'ExpectedTimeoutHeightToAttemptRefund'],
  },
  {
    args: {
      hash,
      network,
      refund_private_key,
      request,
      service_public_key,
      start_height: 1,
      sweep_address: 'address',
      timeout_height: 1,
    },
    description: 'Refund requires timeout height',
    error: [400, 'ExpectedTokensToAttemptRefund'],
  },
  {
    args: {
      hash,
      network,
      request: ({method, url}, cbk) => {
        if (/height/.test(url)) {
          return cbk(null, {statusCode: 200}, 200);
        }

        if (/address/.test(url)) {
          return cbk(null, {statusCode: 200}, [{
            status: {block_height: 200},
            txid: Buffer.alloc(32).toString('hex'),
            value: 1000,
            vout: 0,
          }]);
        }

        if (method === 'POST') {
          return cbk(null, {statusCode: 200}, 'txid');
        }

        return cbk();
      },
      service_public_key,
      refund_private_key: ECPair.makeRandom().privateKey.toString('hex'),
      start_height: 1,
      sweep_address: '2MuZSbMqRdSgRJNYqthHaUwaewiCL85mGvd',
      timeout_height: Infinity,
      tokens: 1000,
    },
    description: 'Swap script requires valid elements',
    error: [400, 'FailedToDeriveSwapScriptForRefundAttempt'],
  },
  {
    args: {
      hash,
      network,
      request: ({method, url}, cbk) => {
        if (/height/.test(url)) {
          return cbk(null, {statusCode: 200}, 99);
        }

        if (/address/.test(url)) {
          return cbk(null, {statusCode: 200}, [{
            status: {block_height: 200},
            txid: Buffer.alloc(32).toString('hex'),
            value: 1000,
            vout: 0,
          }]);
        }

        if (method === 'POST') {
          return cbk(null, {statusCode: 200}, 'txid');
        }

        return cbk();
      },
      service_public_key,
      refund_private_key: ECPair.makeRandom().privateKey.toString('hex'),
      start_height: 1,
      sweep_address: '2MuZSbMqRdSgRJNYqthHaUwaewiCL85mGvd',
      timeout_height: 100,
      tokens: 1000,
    },
    description: 'Refund with request requires valid request response',
    error: [425, 'SwapTimeoutHeightNotMetForRefundTransaction'],
  },
  {
    args: {
      hash,
      network,
      service_public_key,
      refund_private_key: ECPair.makeRandom().privateKey.toString('hex'),
      request: makeRequest({}),
      start_height: 1,
      sweep_address: '2MuZSbMqRdSgRJNYqthHaUwaewiCL85mGvd',
      timeout_height: 100,
      tokens: 1000,
    },
    description: 'Refund with request returns refund details',
    expected: {},
  },
  {
    args: {
      hash,
      network,
      service_public_key,
      refund_private_key: ECPair.makeRandom().privateKey.toString('hex'),
      request: makeRequest({}),
      start_height: 1,
      sweep_address: '2MuZSbMqRdSgRJNYqthHaUwaewiCL85mGvd',
      timeout_height: 100,
      tokens: 1000,
      version: 2,
    },
    description: 'Refund with request v2 returns refund details',
    expected: {},
  },
  {
    args: {
      hash,
      network,
      service_public_key,
      refund_private_key: ECPair.makeRandom().privateKey.toString('hex'),
      request: makeRequest({}),
      start_height: 1,
      sweep_address: '2MuZSbMqRdSgRJNYqthHaUwaewiCL85mGvd',
      timeout_height: 100,
      tokens: 1000,
      version: Number.MAX_SAFE_INTEGER,
    },
    description: 'Refund with unknown request version returns error',
    error: [400, 'UnrecognizedScriptVersionForRefundAttempt'],
  },
];

tests.forEach(({args, description, error, expected}) => {
  return test(description, async ({equal, end, rejects}) => {
    if (!!error) {
      await rejects(attemptRefund(args), error, 'Got expected error');

      return end();
    }

    const refund = await attemptRefund(args);

    Transaction.fromHex(refund.refund_transaction);

    equal(refund.transaction_id, Buffer.alloc(32).toString('hex'), 'Got tx');
    equal(refund.transaction_vout, 0, 'Got refund vout');

    return end();
  });
});


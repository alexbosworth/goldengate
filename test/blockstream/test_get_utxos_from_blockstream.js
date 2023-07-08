const {equal} = require('node:assert').strict;
const {rejects} = require('node:assert').strict;
const test = require('node:test');

const {getUtxosFromBlockstream} = require('./../../blockstream');

const tests = [
  {
    args: {},
    description: 'An address is required to get UTXOs from Blockstream',
    error: [400, 'ExpectedAddressToFindUtxo'],
  },
  {
    args: {address: 'address'},
    description: 'A network is required to get UTXOs from Blockstream',
    error: [400, 'ExpectedKnownNetworkToFindUtxo'],
  },
  {
    args: {address: 'address', network: 'btc'},
    description: 'A request method is required to get UTXOs from Blockstream',
    error: [400, 'ExpectedRequestFunctionToFindUtxo'],
  },
  {
    args: {
      address: 'address',
      network: 'btc',
      request: ({}, cbk) => cbk('err'),
    },
    description: 'A non-error response is expected from Blockstream',
    error: [503, 'UnexpectedErrorFromGetUtxosApi', {err: 'err'}],
  },
  {
    args: {address: 'address', network: 'btc', request: ({}, cbk) => cbk()},
    description: 'A response is expected from Blockstream',
    error: [503, 'ExpectedResponseFromUtxoApi'],
  },
  {
    args: {
      address: 'address',
      network: 'btc',
      request: ({}, cbk) => cbk(null, {statusCode: 500}),
    },
    description: 'A success response code is expected from Blockstream',
    error: [503, 'UnexpectedStatusCodeFromUtxoApi', {statusCode: 500}],
  },
  {
    args: {
      address: 'address',
      network: 'btc',
      request: ({}, cbk) => cbk(null, {statusCode: 200}),
    },
    description: 'UTXOs are expected from Blockstream',
    error: [503, 'ExpectedArrayOfUtxosInBlockstreamApiResponse'],
  },
  {
    args: {
      address: 'address',
      network: 'btc',
      request: ({}, cbk) => cbk(null, {statusCode: 200}, [{}]),
    },
    description: 'A transaction id is required for a UTXO',
    error: [503, 'ExpectedTransactionIdForUtxoInResponse'],
  },
  {
    args: {
      address: 'address',
      network: 'btc',
      request: ({}, cbk) => {
        return cbk(null, {statusCode: 200}, [{
          txid: Buffer.alloc(32).toString('hex'),
        }]);
      },
    },
    description: 'Value is required for a UTXO',
    error: [503, 'ExpectedTokensValueForUtxoInResponse'],
  },
  {
    args: {
      address: 'address',
      network: 'btc',
      request: ({}, cbk) => {
        return cbk(null, {statusCode: 200}, [{
          txid: Buffer.alloc(32).toString('hex'),
          value: 0,
        }]);
      },
    },
    description: 'Vout is required for a UTXO',
    error: [503, 'ExpectedTxOutputIndexForUtxoInResponse'],
  },
  {
    args: {
      address: 'address',
      network: 'btc',
      request: ({}, cbk) => {
        return cbk(null, {statusCode: 200}, [{
          status: {block_height: 1},
          txid: Buffer.alloc(32).toString('hex'),
          value: 0,
          vout: 0,
        }]);
      },
    },
    description: 'UTXO is returned',
    expected: {
      confirm_height: 1,
      tokens: 0,
      transaction_id: Buffer.alloc(32).toString('hex'),
      transaction_vout: 0,
    },
  },
  {
    args: {
      address: 'address',
      network: 'btc',
      request: ({}, cbk) => {
        return cbk(null, {statusCode: 200}, [{
          txid: Buffer.alloc(32).toString('hex'),
          value: 0,
          vout: 0,
        }]);
      },
    },
    description: 'UTXO is returned',
    expected: {
      confirm_height: undefined,
      tokens: 0,
      transaction_id: Buffer.alloc(32).toString('hex'),
      transaction_vout: 0,
    },
  },
];

tests.forEach(({args, description, error, expected}) => {
  return test(description, async () => {
    if (!!error) {
      await rejects(getUtxosFromBlockstream(args), error, 'Got error');
    } else {
      const {utxos} = await getUtxosFromBlockstream(args);

      const [utxo] = utxos;

      equal(utxo.confirm_height, expected.confirm_height, 'Confirm height');
      equal(utxo.tokens, expected.tokens, 'Tokens returned');
      equal(utxo.transaction_id, expected.transaction_id, 'Tx id returned');
      equal(utxo.transaction_vout, expected.transaction_vout, 'Got Tx vout');
    }

    return;
  });
});

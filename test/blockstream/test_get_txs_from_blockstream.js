const {deepEqual} = require('node:assert').strict;
const {equal} = require('node:assert').strict;
const {rejects} = require('node:assert').strict;
const test = require('node:test');

const method = require('./../../blockstream/get_txs_from_blockstream');

const address = 'address';
const network = 'network';
const statusCode = 200;
const txid = Buffer.alloc(32).toString('hex');
const witness = '00';

const tests = [
  {
    args: {},
    description: 'Requires address to get txos',
    error: [400, 'ExpectedAddressOrScriptToFindTransactionsFor'],
  },
  {
    args: {address},
    description: 'Requires network to get txos',
    error: [400, 'ExpectedNetworkToFindTransactionsForAddress'],
  },
  {
    args: {address, network},
    description: 'Requires request to get txos',
    error: [400, 'ExpectedRequestToGetTxsFromBlockstream'],
  },
  {
    args: {address, network, request: ({}, cbk) => cbk('err')},
    description: 'Expected error returned from request',
    error: [503, 'FailedGettingTxsFromBlockstream', {err: 'err'}],
  },
  {
    args: {address, network, request: ({}, cbk) => cbk()},
    description: 'Expected response returned from request',
    error: [503, 'ExpectedResponseGettingTxsFromBlockstream'],
  },
  {
    args: {address, network, request: ({}, cbk) => cbk(null, {})},
    description: 'Expected status code returned from request',
    error: [503, 'UnexpectedStatusGettingTxsFromBlockstream'],
  },
  {
    args: {address, network, request: ({}, cbk) => cbk(null, {statusCode})},
    description: 'Expected tx array returned from request',
    error: [503, 'ExpectedTxArrayGettingTxsFromBlockstream'],
  },
  {
    args: {
      address,
      network,
      request: ({}, cbk) => cbk(null, {statusCode}, [null]),
    },
    description: 'Expected transactions returned from request',
    error: [503, 'ExpectedTransactionFromBlockstreamInArray'],
  },
  {
    args: {
      address,
      network,
      request: ({}, cbk) => cbk(null, {statusCode}, [{txid}]),
    },
    description: 'Expected array of inputs returned from request',
    error: [503, 'ExpectedArrayOfInputsInTxFromBlockstream'],
  },
  {
    args: {
      address,
      network,
      request: ({}, cbk) => cbk(null, {statusCode}, [{vin: [{witness}]}]),
    },
    description: 'Expected transaction id returned from request',
    error: [503, 'ExpectedTransactionIdInBlockstreamResponse'],
  },
  {
    args: {
      address,
      network,
      request: ({}, cbk) => cbk(null, {statusCode}, [{txid, vin: []}]),
    },
    description: 'Expected transaction status returned from request',
    error: [503, 'ExpectedTransactionStatusInBlockstreamTx'],
  },
  {
    args: {
      address,
      network,
      request: ({}, cbk) => {
        return cbk(null, {statusCode}, [{
          txid,
          status: {},
          vin: [{witness}],
          vout: [],
        }]);
      },
    },
    description: 'Expected array of inputs returned from request',
    expected: {id: txid, input: {witness}, outputs: []},
  },
  {
    args: {
      network: 'btc',
      request: ({url}, cbk) => {
        switch (url) {
          case 'https://blockstream.info/api/scripthash/6e340b9cffb37a989ca544e6bb780a2c78901d3fb33738768511a30617afa01d/txs':
            return cbk(null, {statusCode}, [{
              txid,
              status: {},
              vin: [{witness}],
              vout: [{
                scriptpubkey: '00',
                scriptpubkey_address: address,
                value: 1,
              }],
            }]);

          default:
            return cbk(new Error('UnexpectedUrlWhenTestingGetTxs'));
        }
      },
      script: '00',
    },
    description: 'Get transactions for an output script',
    expected: {
      id: txid,
      input: {witness},
      outputs: [{address, index: 0, script: '00', tokens: 1}],
    },
  },
];

tests.forEach(({args, description, error, expected}) => {
  return test(description, async () => {
    if (!!error) {
      await rejects(method(args), error, 'Got expected error');
    } else {
      const {transactions} = await method(args);

      const [tx] = transactions;

      const [input] = tx.inputs;

      equal(tx.id, expected.id, 'Got expected transaction id');
      equal(input.witness, expected.input.witness, 'Got expected witness');
      deepEqual(tx.outputs, expected.outputs, 'Got expected outputs');
    }

    return;
  });
});

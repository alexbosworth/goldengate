const {equal} = require('node:assert').strict;
const {rejects} = require('node:assert').strict;
const test = require('node:test');

const getTxsFromBlockstream = require('./../../blockstream/get_txs_from_blockstream');

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
    expected: {id: txid, input: {witness}},
  },
];

tests.forEach(({args, description, error, expected}) => {
  return test(description, async () => {
    if (!!error) {
      await rejects(getTxsFromBlockstream(args), error, 'Got expected error');
    } else {
      const {transactions} = await getTxsFromBlockstream(args);

      const [tx] = transactions;

      const [input] = tx.inputs;

      equal(tx.id, expected.id, 'Got expected transaction id');
      equal(input.witness, expected.input.witness, 'Got expected witness');
    }

    return;
  });
});

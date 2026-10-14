const {deepEqual} = require('node:assert').strict;
const EventEmitter = require('node:events');
const test = require('node:test');

const {idForTransaction} = require('@alexbosworth/blockchain');
const {transactionFromComponents} = require('@alexbosworth/blockchain');

const {subscribeToSpend} = require('./../../chain');

const api = 'https://blockstream.info/testnet/api';
const fundingTxId = Buffer.alloc(32).toString('hex');
const maxSequence = 0xffffffff;
const network = 'btctestnet';
const okStatus = {statusCode: 200};
const outputScript = '0014751e76e8199196d454941c45d1b3a323f1433bd6';
const vout = 0;

const transaction = transactionFromComponents({
  inputs: [{vout, id: fundingTxId, script: String(), sequence: maxSequence}],
  locktime: 0,
  outputs: [],
  version: 1,
}).transaction;

const spendTxId = idForTransaction({transaction}).id;

const confirmedSpend = {
  spent: true,
  status: {confirmed: true},
  txid: spendTxId,
};

const makeRequest = ({outspends}) => {
  return ({url}, cbk) => {
    switch (url) {
    case `${api}/tx/${fundingTxId}/outspend/${vout}`:
      return cbk(null, okStatus, outspends.shift());

    case `${api}/tx/${spendTxId}/hex`:
      return cbk(null, okStatus, transaction);

    default:
      return cbk(new Error('UnexpectedUrlWhenTestingSubscribeToSpend'));
    }
  };
};

const makeArgs = overrides => {
  const args = {
    network,
    request: makeRequest({outspends: [confirmedSpend]}),
    transaction_id: fundingTxId,
    transaction_vout: vout,
  };

  Object.keys(overrides).forEach(k => args[k] = overrides[k]);

  return args;
};

const tests = [
  {
    args: {
      lnd: {
        chain: {
          registerSpendNtfn: ({}) => {
            const emitter = new EventEmitter();

            emitter.cancel = () => {};

            process.nextTick(() => emitter.emit('data', {
              spend: {
                raw_spending_tx: Buffer.from(transaction, 'hex'),
                spending_height: 200,
                spending_input_index: 0,
              },
            }));

            return emitter;
          },
        },
      },
      min_height: 100,
      output_script: outputScript,
      transaction_id: fundingTxId,
      transaction_vout: vout,
    },
    description: 'A spend is found using lnd',
    expected: {transaction, height: 200, vin: 0},
  },
  {
    args: makeArgs({}),
    description: 'A spend is found using a request function',
    expected: {transaction},
  },
  {
    args: makeArgs({
      delay_ms: 100,
      request: makeRequest({outspends: [{spent: false}, confirmedSpend]}),
    }),
    description: 'A spend is found when the outpoint is spent later',
    expected: {transaction},
  },
  {
    args: makeArgs({request: ({}, cbk) => cbk(null, {statusCode: 503})}),
    description: 'A failure to get the spend is emitted as an error',
    error: [503, 'UnexpectedStatusCodeGettingSpend'],
  },
];

tests.forEach(({args, description, error, expected}) => {
  return test(description, (t, end) => {
    const sub = subscribeToSpend(args);

    sub.on('confirmation', confirmation => {
      sub.removeAllListeners();

      deepEqual(confirmation, expected, 'Got expected confirmation');

      return end();
    });

    sub.on('error', err => {
      sub.removeAllListeners();

      deepEqual(err, error, 'Got expected error');

      return end();
    });

    return;
  });
});

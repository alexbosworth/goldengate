const {test} = require('@alexbosworth/tap');

const {findSpend} = require('./../../blockstream');

const txid = Buffer.alloc(32).toString('hex');

const req = ({statusCode, height, txs, value, vout}) => {
  return ({url}, cbk) => {
    switch (url) {
    case 'https://blockstream.info/testnet/api/address/address/txs':
      return cbk(null, {statusCode: 200}, txs || [{
        status: {block_height: 100},
        txid: Buffer.alloc(32).toString('hex'),
        vin: [{
          witness: [],
          txid: Buffer.alloc(32).toString('hex'),
          vout: 0,
        }],
        vout: [{scriptpubkey_address: 'address', value: 100}],
      }]);

    case 'https://blockstream.info/testnet/api/blocks/tip/height':
      return cbk(null, {statusCode: 200}, height || '200');

    default:
      return cbk(new Error('UnexpedtedUrlWhenTestingFindUtxo'));
    }
  };
};

const makeArgs = overrides => {
  const args = {
    address: 'address',
    network: 'btctestnet',
    request: req({}),
    tokens: 100,
  };

  Object.keys(overrides).forEach(k => args[k] = overrides[k]);

  return args;
};

const tests = [
  {
    args: makeArgs({address: undefined}),
    description: 'Address required',
    error: [400, 'ExpectedAddressToFindSpend'],
  },
  {
    args: makeArgs({network: undefined}),
    description: 'Network required',
    error: [400, 'ExpectedKnownNetworkToFindSpend'],
  },
  {
    args: makeArgs({request: undefined}),
    description: 'Request function required',
    error: [400, 'ExpectedRequestFunctionToFindSpend'],
  },
  {
    args: makeArgs({tokens: undefined}),
    description: 'Tokens are required when outpoint is undefined',
    error: [400, 'ExpectedTokensWhenOutpointUndefinedFindingSpend'],
  },
  {
    args: makeArgs({transaction_id: Buffer.alloc(32).toString('hex')}),
    description: 'A tx vout is required when tx id is defined',
    error: [400, 'ExpectedTransactionVoutWhenFindingSpend'],
  },
  {
    args: makeArgs({request: req({txs: []})}),
    description: 'Transactions are expected',
    error: [404, 'ExpectedTxsForSpendToAddress'],
  },
  {
    args: makeArgs({
      confirmations: 1,
      request: req({txs: [{
        status: {},
        txid: Buffer.alloc(32).toString('hex'),
        vin: [{
          witness: [],
          txid: Buffer.alloc(32).toString('hex'),
          vout: 0,
        }],
        vout: [{scriptpubkey_address: 'address', value: 100}],
      }]}),
    }),
    description: 'A confirmed tx is expected',
    error: [404, 'FailedToFindSpendToAddress'],
  },
  {
    args: makeArgs({confirmations: 1000}),
    description: 'More confirmations are expected',
    error: [404, 'FailedToFindSpendToAddress'],
  },
  {
    args: makeArgs({
      request: req({txs: [{
        status: {},
        txid: Buffer.alloc(32).toString('hex'),
        vin: [{
          witness: [],
          txid: Buffer.alloc(32).toString('hex'),
          vout: 0,
        }],
        vout: [{scriptpubkey_address: 'address', value: 100}],
      }]}),
      transaction_id: Buffer.alloc(32, 1).toString('hex'),
      transaction_vout: 0,
    }),
    description: 'Transaction id should match',
    error: [404, 'FailedToFindSpendToAddress'],
  },
  {
    args: makeArgs({
      request: req({txs: [{
        status: {},
        txid: Buffer.alloc(32).toString('hex'),
        vin: [{
          witness: [],
          txid: Buffer.alloc(32).toString('hex'),
          vout: 0,
        }],
        vout: [{scriptpubkey_address: 'address', value: 100}],
      }]}),
      transaction_id: Buffer.alloc(32).toString('hex'),
      transaction_vout: 1,
    }),
    description: 'Output index should match',
    error: [404, 'FailedToFindSpendToAddress'],
  },
  {
    args: makeArgs({
      request: req({txs: [{
        status: {},
        txid: Buffer.alloc(32).toString('hex'),
        vin: [{
          witness: [],
          txid: Buffer.alloc(32).toString('hex'),
          vout: 0,
        }],
        vout: [{scriptpubkey_address: 'not_address', value: 100}],
      }]}),
      transaction_id: Buffer.alloc(32).toString('hex'),
      transaction_vout: 1,
    }),
    description: 'Address should match',
    error: [404, 'FailedToFindSpendToAddress'],
  },
  {
    args: makeArgs({tokens: 999}),
    description: 'Tokens should match',
    error: [404, 'FailedToFindSpendToAddress'],
  },
  {
    args: makeArgs({}),
    description: 'Find a spend',
    expected: {transaction_id: txid, transaction_vout: 0},
  },
  {
    args: makeArgs({tokens: undefined, transaction_id: txid, transaction_vout: 0}),
    description: 'Find a spend by tx id',
    expected: {transaction_id: txid, transaction_vout: 0},
  },
];

tests.forEach(({args, description, error, expected}) => {
  return test(description, async ({deepEqual, equal, end, rejects}) => {
    if (!!error) {
      await rejects(findSpend(args), error, 'Returns expected error');

      return end();
    }

    const spend = await findSpend(args);

    equal(spend.transaction_id, expected.transaction_id, 'Got tx id');
    equal(spend.transaction_vout, expected.transaction_vout, 'Got tx vout');

    return end();
  });
});

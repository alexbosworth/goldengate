const {test} = require('@alexbosworth/tap');

const {findUtxo} = require('./../../blockstream');

const txid = Buffer.alloc(32).toString('hex');

const req = ({statusCode, utxos, value, vout}) => {
  return ({url}, cbk) => {
    switch (url) {
      case 'https://blockstream.info/testnet/api/address/address/utxo':
        return cbk(null, {statusCode: statusCode || 200}, utxos || [{
          txid,
          status: {block_height: 100},
          value: value || 1000,
          vout: vout || 0,
        }]);

      case 'https://blockstream.info/testnet/api/blocks/tip/height':
        return cbk(null, {statusCode: 200}, '200');

      default:
        return cbk(new Error('UnexpedtedUrlWhenTestingFindUtxo'));
    }
  };
};

const tests = [
  {
    args: {},
    description: 'Address required',
    error: [400, 'ExpectedAddressToFindUtxo'],
  },
  {
    args: {address: 'address'},
    description: 'Confirmation count required',
    error: [400, 'ExpectedConfirmationsCountToFindUtxo'],
  },
  {
    args: {address: 'address', confirmations: 3},
    description: 'A network name is required',
    error: [400, 'ExpectedKnownNetworkToFindUtxo'],
  },
  {
    args: {address: 'address', confirmations: 3, network: 'btctestnet'},
    description: 'A request method is required',
    error: [400, 'ExpectedRequestFunctionToFindUtxo'],
  },
  {
    args: {
      address: 'address',
      confirmations: 3,
      network: 'btctestnet',
      request: req({}),
    },
    description: 'Either an outpoint or tokens are required',
    error: [400, 'ExpectedUtxoTokensWhenFindingUtxo'],
  },
  {
    args: {
      address: 'address',
      confirmations: 3,
      network: 'btctestnet',
      request: req({}),
      tokens: 1000,
      transaction_id: txid,
    },
    description: 'A specified outpoint requires a vout',
    error: [400, 'ExpectedTransactionVoutWhenLookingForUtxoSpend'],
  },
  {
    args: {
      address: 'address',
      confirmations: 3,
      network: 'btctestnet',
      request: req({statusCode: 500}),
      tokens: 1000,
      transaction_id: txid,
      transaction_vout: 0,
    },
    description: 'Must get a valid status from Blockstream',
    error: [503, 'UnexpectedStatusCodeFromUtxoApi'],
  },
  {
    args: {
      address: 'address',
      confirmations: 3,
      network: 'btctestnet',
      request: req({utxos: []}),
      tokens: 1000,
      transaction_id: txid,
      transaction_vout: 0,
    },
    description: 'Must have some UTXOs to find',
    error: [503, 'ExpectedUtxosForDepositAddress'],
  },
  {
    args: {
      address: 'address',
      confirmations: 3,
      network: 'btctestnet',
      request: req({vout: 999}),
      tokens: 1000,
      transaction_id: txid,
      transaction_vout: 0,
    },
    description: 'UTXO must have the specified vout',
    error: [503, 'UnexpectedSpendingUtxoTransactionVout'],
  },
  {
    args: {
      address: 'address',
      confirmations: 3,
      network: 'btctestnet',
      request: req({value: 999}),
      tokens: 1000,
    },
    description: 'UTXO must have the specified value',
    error: [503, 'UnexpectedTokensValueForFoundUtxo'],
  },
  {
    args: {
      address: 'address',
      confirmations: 3,
      network: 'btctestnet',
      request: req({}),
      tokens: 1000,
      transaction_id: Buffer.alloc(32, 1).toString('hex'),
      transaction_vout: 0,
    },
    description: 'Check transaction id when finding utxo',
    error: [503, 'UnexpectedSpendingUtxoTransactionId'],
  },
  {
    args: {
      address: 'address',
      confirmations: 3,
      network: 'btctestnet',
      request: req({}),
      tokens: 1000,
    },
    description: 'Find a utxo',
    expected: {transaction_id: txid, transaction_vout: 0},
  },
  {
    args: {
      address: 'address',
      confirmations: 0,
      network: 'btctestnet',
      request: req({}),
      tokens: 1000,
    },
    description: 'Find a utxo with no confs',
    expected: {transaction_id: txid, transaction_vout: 0},
  },
  {
    args: {
      address: 'address',
      confirmations: 300,
      network: 'btctestnet',
      request: req({}),
      tokens: 1000,
    },
    description: 'Check work on top of UTXO',
    error: [503, 'ExpectedMoreWorkOnTopOfUtxo'],
  },
  {
    args: {
      address: 'address',
      confirmations: 300,
      request: req({}),
      network: 'btctestnet',
      tokens: 100,
    },
    description: 'Make sure the value of the UTXO is enough',
    error: [503, 'UnexpectedTokensValueForFoundUtxo'],
  },
];

tests.forEach(({args, description, error, expected}) => {
  return test(description, async ({deepEqual, equal, end, rejects}) => {
    if (!!error) {
      rejects(findUtxo(args), error, 'Returns expected error');

      return end();
    }

    const utxo = await findUtxo(args);

    equal(utxo.transaction_id, expected.transaction_id, 'Got tx id');
    equal(utxo.transaction_vout, expected.transaction_vout, 'Got tx vout');

    return end();
  });
});

const {test} = require('tap');

const {findUtxo} = require('./../../blockstream');

const txid = Buffer.alloc(32).toString('hex');

const request = ({url}, cbk) => {
  switch (url) {
    case 'https://blockstream.info/testnet/api/address/address/utxo':
      return cbk(null, {statusCode: 200}, [{
        txid,
        status: {block_height: 100},
        value: 1000,
        vout: 0,
      }]);

    case 'https://blockstream.info/testnet/api/blocks/tip/height':
      return cbk(null, {statusCode: 200}, '200');

    default:
      return cbk(new Error('UnexpedtedUrlWhenTestingFindUtxo'));
  }
};

const tests = [
  {
    args: {
      request,
      address: 'address',
      confirmations: 3,
      network: 'btctestnet',
      tokens: 1000,
    },
    description: 'Find a utxo',
    expected: {transaction_id: txid, transaction_vout: 0},
  },
  {
    args: {
      request,
      address: 'address',
      confirmations: 300,
      network: 'btctestnet',
      tokens: 1000,
    },
    description: 'Check work on top of UTXO',
    error: [503, 'ExpectedMoreWorkOnTopOfUtxo'],
  },
  {
    args: {
      request,
      address: 'address',
      confirmations: 300,
      network: 'btctestnet',
      tokens: 100,
    },
    description: 'Make sure the value of the UTXO is enough',
    error: [503, 'UnexpectedTokensValueForFoundUtxo'],
  },
];

tests.forEach(({args, description, error, expected}) => {
  return test(description, ({deepEqual, equal, end}) => {
    return findUtxo(args, (err, utxo) => {
      if (!!error) {
        deepEqual(error, err, 'Got back expected error');

        return end();
      }

      equal(err, null, 'No error finding utxo');

      equal(utxo.transaction_id, expected.transaction_id, 'Got tx id');
      equal(utxo.transaction_vout, expected.transaction_vout, 'Got tx vout');

      return end();
    });
  });
});

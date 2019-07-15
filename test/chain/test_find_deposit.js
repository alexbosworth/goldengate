const EventEmitter = require('events');

const {test} = require('tap');
const {Transaction} = require('bitcoinjs-lib');

const {findDeposit} = require('./../../chain');

const confirmationsEmitter = new EventEmitter();
const {fromHex} = Transaction;
const transaction = '01000000000101a39553582e2d797aa0d31042b9a737758aeac3691f302c11224e36da128a59f20100000000ffffffff02dfed160000000000160014594dcb8eb9c9be306ae8786fc37bd5d3c44e5ea190d003000000000022002086daa389646653a4d447d2c29edeea0699f7c4bf62e2b2ee9fe5bdb6ec21b82b02483045022100ce17fb91481425494dc96e92855de5af916737c23b882410f511195b01ee081e022015a4b06847dda99bbe5512a728f55fe551ef4561fe8cc792056a82e43c88cd8b012103c33feb98c803a306163e0c29a87b18787f11c37f89cdcd0d4122536d6e2044ee00000000';

const tests = [
  {
    args: {
      address: 'tb1qsmd28ztyvef6f4z86tpfahh2q6vl039lvt3t9m5luk7mdmpphq4sf3spnr',
      after: 1,
      confirmations: 3,
      lnd: {
        chain: {
          registerConfirmationsNtfn: ({}) => confirmationsEmitter,
        },
      },
      network: 'btctestnet',
      timeout: 1000,
      tokens: 100,
    },
    description: 'Find a deposit to an address via LND',
    expected: {
      transaction_id: fromHex(transaction).getId(),
      transaction_vout: 1,
    },
  },
  {
    args: {
      address: 'tb1qsmd28ztyvef6f4z86tpfahh2q6vl039lvt3t9m5luk7mdmpphq4sf3spnr',
      after: 1,
      confirmations: 3,
      lnd: {
        chain: {
          registerConfirmationsNtfn: ({}) => confirmationsEmitter,
        },
      },
      network: 'btctestnet',
      timeout: 1000,
      transaction_id: 'f2598a12da364e22112c301f69c3ea8a7537a7b94210d3a07a792d2e585395a3',
      transaction_vout: 1,
    },
    description: 'Find a deposit to an address via LND',
    expected: {
      transaction_id: fromHex(transaction).getId(),
      transaction_vout: 1,
    },
  },
  {
    args: {
      address: 'address',
      confirmations: 3,
      network: 'btctestnet',
      request: ({url}, cbk) => {
        switch (url) {
        case 'https://blockstream.info/testnet/api/address/address/utxo':
          return cbk(null, {statusCode: 200}, [{
            status: {block_height: 100},
            txid: Buffer.alloc(32).toString('hex'),
            value: 100,
            vout: 0,
          }]);

        case 'https://blockstream.info/testnet/api/blocks/tip/height':
          return cbk(null, {statusCode: 200}, '200');

        default:
          return cbk(new Error('UnexpectedUrlInFindDepositTest'));
        }
      },
      timeout: 60000,
      tokens: 100,
    },
    description: 'Find a deposit to address via Blockstream request',
    expected: {
      transaction_id: Buffer.alloc(32).toString('hex'),
      transaction_vout: 0,
    },
  },
  {
    args: {
      address: 'address',
      confirmations: 3,
      network: 'btctestnet',
      request: ({url}, cbk) => {
        switch (url) {
        case 'https://blockstream.info/testnet/api/address/address/utxo':
          return cbk(null, {statusCode: 200}, [{
            status: {block_height: 100},
            txid: 'f2598a12da364e22112c301f69c3ea8a7537a7b94210d3a07a792d2e585395a3',
            value: 100,
            vout: 1,
          }]);

        case 'https://blockstream.info/testnet/api/blocks/tip/height':
          return cbk(null, {statusCode: 200}, '200');

        default:
          return cbk(new Error('UnexpectedUrlInFindDepositTest'));
        }
      },
      timeout: 60000,
      tokens: 100,
    },
    description: 'Find a deposit to address via Blockstream request',
    expected: {
      transaction_id: 'f2598a12da364e22112c301f69c3ea8a7537a7b94210d3a07a792d2e585395a3',
      transaction_vout: 1,
    },
  },
];

tests.forEach(({args, description, expected}) => {
  return test(description, ({equal, end}) => {
    setTimeout(() => confirmationsEmitter.emit('data', {
      conf: {
        block_hash: Buffer.alloc(32),
        block_height: 1,
        raw_tx: Buffer.from(transaction, 'hex'),
      },
    }), 20);

    return findDeposit(args, (err, res) => {
      equal(err, null, 'No error finding deposit');

      equal(res.transaction_id, expected.transaction_id, 'Got transaction id');
      equal(res.transaction_vout, expected.transaction_vout, 'Got tx vout');

      return end();
    });
  });
});

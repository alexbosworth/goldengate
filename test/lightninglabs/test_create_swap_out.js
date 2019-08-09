const {ECPair} = require('bitcoinjs-lib');
const {test} = require('tap');

const {createSwapOut} = require('./../../');

const expiry = 150;
const serviceKey = ECPair.makeRandom().publicKey.toString('hex');

const tests = [
  {
    args: {
      service: {
        newLoopOutSwap: ({}, cbk) => {
          return cbk(null, {
            expiry,
            prepay_invoice: 'prepay_invoice',
            sender_key: serviceKey,
            swap_invoice: 'swap_invoice',
          });
        },
      },
      network: 'btctestnet',
      tokens: 100,
    },
    description: 'Create a swap',
    expected: {
      expiry,
      prepay: 'prepay_invoice',
      swap_payreq: 'swap_invoice',
    },
  },
];

tests.forEach(({args, description, expected}) => {
  return test(description, ({equal, end}) => {
    return createSwapOut(args, (err, res) => {
      equal(err, null, 'No error creating swap');

      equal(!!res.private_key, true, 'Private key created');
      equal(!!res.secret, true, 'Preimage secret created');
      equal(res.service_public_key, serviceKey, 'Service key returned');
      equal(res.swap_execute_request, expected.prepay, 'Prepay pay request');
      equal(res.swap_fund_request, expected.swap_payreq, 'Swap pay request');
      equal(res.timeout, expected.expiry, 'Swap expiry height');

      return end();
    });
  });
});

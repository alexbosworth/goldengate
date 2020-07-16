const {ECPair} = require('bitcoinjs-lib');
const {test} = require('@alexbosworth/tap');

const {swapInAddress} = require('./../../lightninglabs');

const keyFrom = hex => ECPair.fromPrivateKey(Buffer.from(hex, 'hex'));
const refundKey = '072db93905524bab450f84b8ae7ab3ddafe80af501c5b22a6335d501c8ffc5b1';
const serviceKey = 'bf1d1d7ae00f065bc89e02e5ead223b9182bf412bebe9b3afe73272204d4e0bd';

const tests = [
  {
    args: {
      hash: Buffer.alloc(32).toString('hex'),
      network: 'btctestnet',
      refund_private_key: keyFrom(refundKey).privateKey.toString('hex'),
      service_public_key: keyFrom(serviceKey).publicKey.toString('hex'),
      timeout_height: 100,
    },
    description: 'Swap in address created',
    expected: {nested: '2MsQEU4EPn1j4bktTueLGSp9BvptLHEzESQ'},
  },
  {
    args: {
      hash: Buffer.alloc(32).toString('hex'),
      network: 'btctestnet',
      refund_private_key: keyFrom(refundKey).privateKey.toString('hex'),
      service_public_key: keyFrom(serviceKey).publicKey.toString('hex'),
      timeout_height: Infinity,
    },
    description: 'Swap in address created',
    error: 'FailedToDeriveSwapAddressForSwapInAddress',
  },
  {
    args: {},
    description: 'Swap in address requires hash',
    error: 'ExpectedSwapHashForSwapInAddress',
  },
  {
    args: {hash: Buffer.alloc(32).toString('hex')},
    description: 'Swap in address requires hash',
    error: 'ExpectedNetworkNameForSwapInAddress',
  },
  {
    args: {hash: Buffer.alloc(32).toString('hex'), network: 'btctestnet'},
    description: 'Swap in address requires hash',
    error: 'ExpectedRefundPrivateKeyForSwapInAddress',
  },
  {
    args: {
      hash: Buffer.alloc(32).toString('hex'),
      network: 'btctestnet',
      refund_private_key: keyFrom(refundKey).privateKey.toString('hex'),
    },
    description: 'Swap in address requires hash',
    error: 'ExpectedServicePublicKeyForSwapInAddress',
  },
  {
    args: {
      hash: Buffer.alloc(32).toString('hex'),
      network: 'btctestnet',
      refund_private_key: keyFrom(refundKey).privateKey.toString('hex'),
      service_public_key: keyFrom(serviceKey).publicKey.toString('hex'),
    },
    description: 'Swap in address requires hash',
    error: 'ExpectedTimeoutHeightForSwapInAddress',
  },
];

tests.forEach(({args, description, expected, error}) => {
  return test(description, ({equal, end, throws}) => {
    if (!!error) {
      throws(() => swapInAddress(args), new Error(error));

      return end();
    }

    const {nested} = swapInAddress(args);

    equal(nested, expected.nested, 'Swap address derived');

    return end();
  });
});

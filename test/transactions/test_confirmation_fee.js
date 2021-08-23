const {test} = require('@alexbosworth/tap');

const {confirmationFee} = require('./../../');

const tests = [
  {
    args: {},
    description: 'A before block height is required',
    error: 'ExpectedTargetUltimateConfirmHeight',
  },
  {
    args: {before: 1},
    description: 'A cursor is required',
    error: 'ExpectedBlockHeightCursorNumber',
  },
  {
    args: {before: 1, cursor: 0},
    description: 'A multiplier is required',
    error: 'ExpectedMaximumFeeMultiplier',
  },
  {
    args: {
      before: 25,
      cursor: 0,
      multiplier: 1000,
    },
    description: 'Cursor starts at the default fee',
    expected: 1,
  },
  {
    args: {
      before: 25,
      cursor: 12,
      fee: 1,
      multiplier: 1000,
    },
    description: 'Fee grows by an order of magnitude',
    expected: 27.5422871,
  },
  {
    args: {
      before: 25,
      cursor: 25,
      fee: 1,
      multiplier: 1000,
    },
    description: 'Fee reaches its max value at max cursor',
    expected: 1000,
  },
  {
    args: {
      before: 25,
      cursor: 26,
      fee: 3.14,
      multiplier: 1000,
    },
    description: 'Fee never exceeds its max multiplier',
    expected: 3140,
  },
];

tests.forEach(({args, description, error, expected}) => {
  return test(description, ({equal, end, throws}) => {
    if (!!error) {
      throws(() => confirmationFee(args), new Error(error), 'Got error');

      return end();
    }

    const {rate} = confirmationFee(args);

    equal(rate, expected, 'Rate derived for cursor');

    return end();
  });
});

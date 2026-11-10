const {deepEqual} = require('node:assert').strict;
const test = require('node:test');

const batchHeights = require('./../../chain/batch_heights');

const tests = [
  {
    args: {end: 102, size: 8, start: 100},
    description: 'A range smaller than a batch is one batch',
    expected: {batches: [[100, 101, 102]]},
  },
  {
    args: {end: 107, size: 4, start: 100},
    description: 'A range is split into full batches',
    expected: {batches: [[100, 101, 102, 103], [104, 105, 106, 107]]},
  },
  {
    args: {end: 104, size: 2, start: 100},
    description: 'The last batch ends at the end of the range',
    expected: {batches: [[100, 101], [102, 103], [104]]},
  },
  {
    args: {end: 100, size: 8, start: 100},
    description: 'A range can be a single height',
    expected: {batches: [[100]]},
  },
  {
    args: {end: 99, size: 8, start: 100},
    description: 'A range can be empty',
    expected: {batches: []},
  },
  {
    args: {end: 90, size: 8, start: 100},
    description: 'An end before the start is an empty range',
    expected: {batches: []},
  },
];

tests.forEach(({args, description, expected}) => {
  return test(description, () => {
    deepEqual(batchHeights(args), expected, 'Got batches');

    return;
  });
});

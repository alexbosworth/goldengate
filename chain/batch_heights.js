const {ceil} = Math;
const range = count => Array.from({length: count}, (_, i) => i);
const rangeCount = ({end, start}) => Math.max(0, end - start + 1);

/** Split a range of block heights into batches of consecutive heights

  {
    end: <Last Height Number>
    size: <Batch Size Number>
    start: <First Height Number>
  }

  @returns
  {
    batches: [[<Block Height Number>]]
  }
*/
module.exports = ({end, size, start}) => {
  const count = rangeCount({end, start});

  const heights = range(count).map(n => start + n);

  const batchesCount = ceil(count / size);

  // Each batch starts where the batch before it ends
  const starts = range(batchesCount).map(n => n * size);

  return {batches: starts.map(i => heights.slice(i, i + size))};
};

const {ceil} = Math;
const defaultFee = 1;
const {max} = Math;
const {min} = Math;
const minFee = 1;
const {pow} = Math;
const precision = 1e7;

/** Confirmation fee rate for an on-chain transaction

  This will target reaching a maximum fee rate at a specified block height in
  an exponential scale, with the position on the scale given by the current
  block.

  {
    before: <Target Confirm Before N Blocks Number>
    cursor: <Block Cursor Number>
    [fee]: <Baseline Fee In VBytes per Token Number>
    multiplier: <Maximum Multiplier of Fee Number>
  }

  @throws
  <Error>

  @returns
  {
    rate: <Fee Rate in VBytes per Token Number>
  }
*/
module.exports = ({before, cursor, fee, multiplier}) => {
  if (!before) {
    throw new Error('ExpectedTargetUltimateConfirmHeight');
  }

  if (cursor === undefined) {
    throw new Error('ExpectedBlockHeightCursorNumber');
  }

  if (!multiplier) {
    throw new Error('ExpectedMaximumFeeMultiplier');
  }

  const maxFeeMultiple = multiplier;
  const reachMaxFeeBlockTarget = before;

  const increaseRate = pow(maxFeeMultiple, 1 / reachMaxFeeBlockTarget);

  const rate = (fee || defaultFee) * pow(increaseRate, min(before, cursor));

  return {rate: max(minFee, ceil(rate * precision) / precision)};
};

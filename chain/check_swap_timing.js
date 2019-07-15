const minRequiredBufferBlocks = 0;

/** Check that there are sufficient future blocks remaining for a swap

  {
    current_block_height: <Best Chain Tip Height Number>
    [required_buffer_blocks]: <Required Buffer Blocks Count>
    required_funding_confirmations: <Safe Funding Confirmation Count Number>
    required_sweep_confirmations: <Safely Sweeped Confirmation Count Number>
    timeout_height: <Swap Timeout Height Number>
  }

  @throws
  <Error>

  @returns
  {
    buffer_count: <Buffer Confirmation Blocks Count Number>
  }
*/
module.exports = args => {
  if (!args.current_block_height) {
    throw new Error('ExpectedCurrentBlockHeight');
  }

  if (args.required_funding_confirmations === undefined) {
    throw new Error('ExpectedRequiredFundingConfirmationsCount');
  }

  if (args.required_sweep_confirmations === undefined) {
    throw new Error('ExpectedRequiredSweepConfirmationsCount');
  }

  if (!args.timeout_height) {
    throw new Error('ExpectedSwapTimeoutHeight');
  }

  const requiredFundingBlocks = args.required_funding_confirmations;
  const requiredSweepBlocks = args.required_sweep_confirmations;
  const timeoutBlocks = args.timeout_height - args.current_block_height;

  const blocks = timeoutBlocks - requiredFundingBlocks - requiredSweepBlocks;

  if (blocks < args.required_buffer_blocks || minRequiredBufferBlocks) {
    throw new Error('InsufficientTimeRemainingForSwap');
  }

  return {buffer_count: blocks};
};

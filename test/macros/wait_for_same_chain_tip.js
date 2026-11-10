const asyncRetry = require('async/retry');
const {getHeight} = require('ln-service');

const interval = 50;
const times = 2400;

/** Wait for nodes to have the same chain tip

  Nodes in a cluster each have their own chain backend. A node that mines
  before it has the blocks that another node mined starts a competing chain,
  and the reorg to the longer chain can take coins and confirmations away, so
  a node waits for the other nodes' blocks before it mines after them

  A chain daemon tries a failed peer connection again a minute later, so the
  wait is long enough to cover that

  {
    lnds: [<Authenticated LND API Object>]
  }

  @returns via Promise
*/
module.exports = async ({lnds}) => {
  return await asyncRetry({interval, times}, async () => {
    const tips = await Promise.all(lnds.map(lnd => getHeight({lnd})));

    const [{current_block_hash: hash}] = tips;

    if (tips.some(tip => tip.current_block_hash !== hash)) {
      throw new Error('ExpectedNodesToHaveTheSameChainTip');
    }
  });
};

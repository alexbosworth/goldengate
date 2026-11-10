const {hashForTree} = require('p2tr');
const {v1OutputScript} = require('p2tr');

const musig2KeyAggregate = require('./../../script/musig2_key_aggregate');
const musig2KeySort = require('./../../script/musig2_key_sort');
const {swapScriptBranches} = require('./../../script');
const xOnlyPublicKey = require('./../../taproot/x_only_public_key');

/** Get the Taproot HTLC of a swap out the way that the client derives it

  {
    claim_public_key: <Client Claim Public Key Hex String>
    hash: <Swap Hash Hex String>
    service_public_key: <Service Refund Public Key Hex String>
    timeout: <Swap Timeout Height Number>
  }

  @returns
  {
    branches: [{
      script: <Leaf Script Hex String>
    }]
    claim: <Claim Leaf Script Hex String>
    external_key: <Taproot Output Public Key Hex String>
    internal_key: <X Only Internal Public Key Hex String>
    output_script: <HTLC Output Script Hex String>
    refund: <Refund Leaf Script Hex String>
    root_hash: <Script Tree Root Hash Hex String>
  }
*/
module.exports = args => {
  const {branches, claim, refund} = swapScriptBranches({
    claim_public_key: args.claim_public_key,
    hash: args.hash,
    refund_public_key: args.service_public_key,
    timeout: args.timeout,
  });

  // The internal key aggregates the client and service keys with MuSig2
  const {sorted} = musig2KeySort({
    public_keys: [args.claim_public_key, args.service_public_key],
  });

  const aggregate = musig2KeyAggregate({public_keys: sorted});

  const internalKey = xOnlyPublicKey({public_key: aggregate.public_key});

  const rootHash = hashForTree({branches}).hash;

  const output = v1OutputScript({
    hash: rootHash,
    internal_key: internalKey.x_only,
  });

  return {
    branches,
    claim,
    refund,
    external_key: output.external_key,
    internal_key: internalKey.x_only,
    output_script: output.script,
    root_hash: rootHash,
  };
};

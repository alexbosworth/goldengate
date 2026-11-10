const {addressForScript} = require('./../script');
const {swapScriptV2} = require('./../script');

/** Derive the fallback HTLC script and address of a swap in

  {
    claim_public_key: <Service HTLC Public Key Hex String>
    hash: <Swap Hash Hex String>
    network: <Network Name String>
    refund_public_key: <HTLC Refund Public Key Hex String>
    timeout: <Swap HTLC Timeout Height Number>
  }

  @returns
  {
    [address]: <Swap HTLC Chain Address String>
    [err]: <Error Object>
    [script]: <Swap HTLC Witness Script Hex String>
  }
*/
module.exports = args => {
  try {
    const {script} = swapScriptV2({
      claim_public_key: args.claim_public_key,
      hash: args.hash,
      refund_public_key: args.refund_public_key,
      timeout: args.timeout,
    });

    const {address} = addressForScript({script, network: args.network});

    return {address, script};
  } catch (err) {
    return {err};
  }
};

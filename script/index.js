const addressForScript = require('./address_for_script');
const getPublicKey = require('./get_public_key');
const isSwapScriptV2 = require('./is_swap_script_v2');
const makePrivateKey = require('./make_private_key');
const p2wshOutputScript = require('./p2wsh_output_script');
const sharedAddressScript = require('./shared_address_script');
const swapScriptBranches = require('./swap_script_branches');
const swapScriptV2 = require('./swap_script_v2');

module.exports = {
  addressForScript,
  getPublicKey,
  isSwapScriptV2,
  makePrivateKey,
  p2wshOutputScript,
  sharedAddressScript,
  swapScriptBranches,
  swapScriptV2,
};

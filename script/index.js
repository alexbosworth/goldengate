const addressForScript = require('./address_for_script');
const getPublicKey = require('./get_public_key');
const nestedWitnessScript = require('./nested_witness_script');
const p2shOutputScript = require('./p2sh_output_script');
const p2shP2wshOutputScript = require('./p2sh_p2wsh_output_script');
const p2wshOutputScript = require('./p2wsh_output_script');
const swapScript = require('./swap_script');

module.exports = {
  addressForScript,
  getPublicKey,
  nestedWitnessScript,
  p2shOutputScript,
  p2shP2wshOutputScript,
  p2wshOutputScript,
  swapScript,
};

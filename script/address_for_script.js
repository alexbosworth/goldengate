const {address} = require('bitcoinjs-lib');
const {networks} = require('bitcoinjs-lib');

const {names} = require('./../conf/bitcoinjs-lib');
const p2shP2wshOutputScript = require('./p2sh_p2wsh_output_script');
const p2wshOutputScript = require('./p2wsh_output_script');

const {fromOutputScript} = address;
const hexAsBuf = hex => Buffer.from(hex, 'hex');

/** Derive address from witness script

  {
    network: <Network Name String>
    script: <Witness Script Hex String>
  }

  @throws
  <Error>

  @returns
  {
    address: <Native Witness Address String>
    nested: <Nested Witness Address String>
  }
*/
module.exports = ({network, script}) => {
  if (!network) {
    throw new Error('ExpectedNetworkNameToDeriveAddress');
  }

  if (!names[network]) {
    throw new Error('ExpectedKnownNetworkToDeriveAddress');
  }

  if (!script) {
    throw new Error('ExpectedWitnessScriptToDeriveAddress');
  }

  const nested = p2shP2wshOutputScript({script});
  const {output} = p2wshOutputScript({script});

  return {
    address: fromOutputScript(hexAsBuf(output), networks[names[network]]),
    nested: fromOutputScript(hexAsBuf(nested.output), networks[names[network]]),
  };
};

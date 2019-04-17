const {address} = require('bitcoinjs-lib');
const {networks} = require('bitcoinjs-lib');

const {names} = require('./conf/bitcoinjs-lib');
const p2wshOutputScript = require('./p2wsh_output_script');

const {fromOutputScript} = address;
const hexAsBuf = hex => Buffer.from(hex, 'hex');

/** Derive swap address from redeem script

  {
    network: <Network Name String>
    script: <Redeem Script Hex String>
  }

  @throws
  <Error>

  @returns
  {
    address: <Swap Address String>
  }
*/
module.exports = ({network, script}) => {
  if (!network) {
    throw new Error('ExpectedNetworkNameToDeriveSwapAddress');
  }

  if (!names[network]) {
    throw new Error('ExpectedKnownNetworkToDeriveSwapAddress');
  }

  if (!script) {
    throw new Error('ExpectedRedeemScriptToDeriveSwapAddress');
  }

  const {output} = p2wshOutputScript({script});

  const address = fromOutputScript(hexAsBuf(output), networks[names[network]]);

  return {address};
};

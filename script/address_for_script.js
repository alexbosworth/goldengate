const {encodeBech32Address} = require('@alexbosworth/blockchain');

const {names} = require('./../conf/networks');
const p2wshOutputScript = require('./p2wsh_output_script');

const hexAsBuf = hex => Buffer.from(hex, 'hex');
const prefixes = {mainnet: 'bc', regtest: 'bcrt', signet: 'tb', testnet: 'tb'};
const witnessProgramStart = 2;
const witnessVersion = 0;

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

  const {output} = p2wshOutputScript({script});

  const {address} = encodeBech32Address({
    prefix: prefixes[names[network]],
    program: hexAsBuf(output).subarray(witnessProgramStart),
    version: witnessVersion,
  });

  return {address};
};

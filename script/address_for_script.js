const {encodeBase58Address} = require('@alexbosworth/blockchain');
const {encodeBech32Address} = require('@alexbosworth/blockchain');

const {names} = require('./../conf/bitcoinjs-lib');
const p2shP2wshOutputScript = require('./p2sh_p2wsh_output_script');
const p2wshOutputScript = require('./p2wsh_output_script');

const hexAsBuf = hex => Buffer.from(hex, 'hex');
const p2shVersions = {mainnet: 0x05, regtest: 0xc4, testnet: 0xc4};
const prefixes = {mainnet: 'bc', regtest: 'bcrt', testnet: 'tb'};
const scriptHashEnd = 2 + 20;
const scriptHashStart = 2;
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

  const nested = hexAsBuf(p2shP2wshOutputScript({script}).output);
  const {output} = p2wshOutputScript({script});

  const hash = nested.subarray(scriptHashStart, scriptHashEnd);
  const program = hexAsBuf(output).subarray(witnessProgramStart);

  const encodedBase58 = encodeBase58Address({
    hash,
    version: p2shVersions[names[network]],
  });

  const encodedBech32 = encodeBech32Address({
    program,
    prefix: prefixes[names[network]],
    version: witnessVersion,
  });

  return {address: encodedBech32.address, nested: encodedBase58.address};
};

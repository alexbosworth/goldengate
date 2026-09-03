const {decodeBase58Address} = require('@alexbosworth/blockchain');
const {p2pkhOutputScript} = require('@alexbosworth/blockchain');
const {p2shOutputScript} = require('@alexbosworth/blockchain');
const {p2trOutputScript} = require('@alexbosworth/blockchain');
const {p2wpkhOutputScript} = require('@alexbosworth/blockchain');
const {p2wshOutputScript} = require('@alexbosworth/blockchain');

const decodeBech32 = require('./decode_bech32');
const {names} = require('./../conf/bitcoinjs-lib');

const bufferAsHex = buffer => buffer.toString('hex');
const byteLengthForP2tr = 32;
const byteLengthForP2wpkh = 20;
const byteLengthForP2wsh = 32;
const p2pkhVersions = {mainnet: 0x00, regtest: 0x6f, testnet: 0x6f};
const p2shVersions = {mainnet: 0x05, regtest: 0xc4, testnet: 0xc4};
const prefixes = {mainnet: 'bc', regtest: 'bcrt', testnet: 'tb'};
const versionInitialSegwit = 0;
const versionTaproot = 1;

/** Get the output script for an address

  {
    address: <Address String>
    network: <Network Name String>
  }

  @throws
  <Error>

  @returns
  {
    script: <Output Script Hex String>
  }
*/
module.exports = ({address, network}) => {
  if (!address) {
    throw new Error('ExpectedAddressToConvertToOutputScript');
  }

  if (!names[network]) {
    throw new Error('ExpectedKnownNetworkToConvertAddressToOutputScript');
  }

  const bech32 = decodeBech32({address});

  // Exit early when this is not a bech32 address
  if (!bech32.program) {
    const {hash, version} = decodeBase58Address({address});

    switch (version) {
    case p2pkhVersions[names[network]]:
      return {script: bufferAsHex(p2pkhOutputScript({hash}).script)};

    case p2shVersions[names[network]]:
      return {script: bufferAsHex(p2shOutputScript({hash}).script)};

    default:
      throw new Error('InvalidNetworkToConvertAddressToOutputScript');
    }
  }

  const {prefix, program, version} = bech32;

  if (prefix !== prefixes[names[network]]) {
    throw new Error('InvalidNetworkToConvertAddressToOutputScript');
  }

  switch (version) {
  case versionInitialSegwit:
    if (program.length === byteLengthForP2wpkh) {
      return {script: bufferAsHex(p2wpkhOutputScript({hash: program}).script)};
    }

    if (program.length === byteLengthForP2wsh) {
      return {script: bufferAsHex(p2wshOutputScript({hash: program}).script)};
    }

    throw new Error('UnexpectedByteLengthForWitnessVersionZeroAddress');

  case versionTaproot:
    if (program.length !== byteLengthForP2tr) {
      throw new Error('UnexpectedByteLengthForPayToTaprootAddress');
    }

    return {script: bufferAsHex(p2trOutputScript({hash: program}).script)};

  default:
    throw new Error('UnexpectedVersionOfAddressToConverToOutputScript');
  }
};

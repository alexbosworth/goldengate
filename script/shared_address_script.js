const {encodeBech32Address} = require('@alexbosworth/blockchain');
const {hashForTree} = require('p2tr');
const {isPoint} = require('tiny-secp256k1');
const {OP_1} = require('bitcoin-ops');
const {OP_CHECKSEQUENCEVERIFY} = require('bitcoin-ops');
const {OP_CHECKSIGVERIFY} = require('bitcoin-ops');
const {scriptElementsAsScript} = require('@alexbosworth/blockchain');
const {v1OutputScript} = require('p2tr');

const encodeScriptNumber = require('./encode_script_number');
const musig2KeyAggregate = require('./musig2_key_aggregate');
const musig2KeySort = require('./musig2_key_sort');
const {names} = require('./../conf/networks');

const compressedPublicKeyHexLength = 66;
const encodeNumber = number => encodeScriptNumber({number}).encoded;
const hexAsBuffer = hex => Buffer.from(hex, 'hex');
const isHex = n => /^[0-9A-F]*$/i.test(n);
const {isInteger} = Number;
const maxCsvBlocks = 0xffff;
const maxSmallInteger = 16;
const prefixes = {mainnet: 'bc', regtest: 'bcrt', signet: 'tb', testnet: 'tb'};
const smallIntOpCode = n => OP_1 - 1 + n;
const witnessProgramStart = 2;
const witnessVersion = 1;
const xOnlyKey = key => key.slice(2);

/** Get the scripts and address of a shared address with the swap service

  {
    client_public_key: <Client Compressed Public Key Hex String>
    expiry: <Relative Timelock Blocks Count Number>
    network: <Network Name String>
    server_public_key: <Server Compressed Public Key Hex String>
  }

  @throws
  <Error>

  @returns
  {
    address: <Shared Address String>
    external_key: <Taproot Output External Public Key Hex String>
    internal_key: <Taproot Output X Only Internal Public Key Hex String>
    output_script: <Shared Address Output Script Hex String>
    root_hash: <Taproot Script Tree Root Hash Hex String>
    script_branches: [{
      script: <Leaf Script Hex String>
    }]
    timeout_script: <Client Timeout Path Leaf Script Hex String>
  }
*/
module.exports = args => {
  const isKey = n => isHex(n) && n.length === compressedPublicKeyHexLength;

  if (!isKey(args.client_public_key)) {
    throw new Error('ExpectedClientPublicKeyForSharedAddressScript');
  }

  if (!isPoint(hexAsBuffer(args.client_public_key))) {
    throw new Error('ExpectedValidClientPublicKeyForSharedAddressScript');
  }

  if (!isInteger(args.expiry) || args.expiry < 1) {
    throw new Error('ExpectedExpiryBlocksCountForSharedAddressScript');
  }

  // The expiry has to fit within a relative block count timelock
  if (args.expiry > maxCsvBlocks) {
    throw new Error('ExpectedLowerExpiryBlocksCountForSharedAddressScript');
  }

  if (!args.network || !names[args.network]) {
    throw new Error('ExpectedKnownNetworkForSharedAddressScript');
  }

  if (!isKey(args.server_public_key)) {
    throw new Error('ExpectedServerPublicKeyForSharedAddressScript');
  }

  if (!isPoint(hexAsBuffer(args.server_public_key))) {
    throw new Error('ExpectedValidServerPublicKeyForSharedAddressScript');
  }

  // Expiries of 16 or fewer blocks are pushed as small integer op codes
  const expiry = args.expiry <= maxSmallInteger ?
    smallIntOpCode(args.expiry) :
    encodeNumber(args.expiry);

  const timeout = scriptElementsAsScript({
    elements: [
      hexAsBuffer(xOnlyKey(args.client_public_key)), OP_CHECKSIGVERIFY,
      expiry, OP_CHECKSEQUENCEVERIFY,
    ],
  });

  const branches = [{script: timeout.script}];

  // The internal key aggregates the keys in BIP 327 KeySort order
  const {sorted} = musig2KeySort({
    public_keys: [args.client_public_key, args.server_public_key],
  });

  const aggregate = musig2KeyAggregate({public_keys: sorted});

  const internalKey = xOnlyKey(aggregate.public_key);

  const rootHash = hashForTree({branches}).hash;

  const output = v1OutputScript({hash: rootHash, internal_key: internalKey});

  const {address} = encodeBech32Address({
    prefix: prefixes[names[args.network]],
    program: hexAsBuffer(output.script).subarray(witnessProgramStart),
    version: witnessVersion,
  });

  return {
    address,
    external_key: output.external_key,
    internal_key: internalKey,
    output_script: output.script,
    root_hash: rootHash,
    script_branches: branches,
    timeout_script: timeout.script,
  };
};

const {script} = require('bitcoinjs-lib');

const addressDatafromBech32 = require('./address_data_from_bech32');

const bufferAsHex = buffer => buffer.toString('hex');
const {compile} = script;
const encodeVersion = version => 80 + version;

/** Map a bech32 address to an output script

  {
    address: <Bech32 Address String>
  }

  @returns
  {
    script: <Output Script Hex String>
  }
*/
module.exports = ({address}) => {
  const decoded = addressDatafromBech32({address});

  // Encode the version as a script number
  const version = !decoded.version ? Number() : encodeVersion(decoded.version);

  // Bech32 addresses are a version number plus a data push
  return {script: bufferAsHex(compile([version, decoded.data]))};
};

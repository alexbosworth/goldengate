const {bech32} = require('bech32');
const {bech32m} = require('bech32');

/** Parse address data from a bech32 or bech32m encoded string

  {
    address: <Bech32 or Bech32m Encoded String>
  }

  @throws
  <Error>

  @returns
  {
    data: <Address Data Buffer Object>
    version: <Address Version Number>
  }
*/
module.exports = ({address}) => {
  // Support v0 stye bech32 addresses
  try {
    const [version, ...data] = bech32.decode(address).words;

    return {version, data: Buffer.from(bech32.fromWords(data))};
  } catch (err) {
    // Ignore errors since this might be a bech32m address
  }

  const [version, ...data] = bech32m.decode(address).words;

  return {version, data: Buffer.from(bech32m.fromWords(data))};
};

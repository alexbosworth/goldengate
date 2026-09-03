const {decodeBech32Address} = require('@alexbosworth/blockchain');

/** Decode a bech32 address, returning nothing when the address is not bech32

  {
    address: <Address String>
  }

  @returns
  {
    [prefix]: <Human Readable Prefix String>
    [program]: <Witness Program Buffer Object>
    [version]: <Witness Version Number>
  }
*/
module.exports = ({address}) => {
  try {
    return decodeBech32Address({address});
  } catch (err) {
    return {};
  }
};

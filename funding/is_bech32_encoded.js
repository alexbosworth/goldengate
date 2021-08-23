const {address} = require('bitcoinjs-lib');

const addressDatafromBech32 = require('./address_data_from_bech32');

/** Determine if a string is bech32 encoded

  {
    input: <Input String>
  }

  @returns
  {
    is_bech32: <String is Bech32 Encoded Bool>
  }
*/
module.exports = ({input}) => {
  try {
    return {is_bech32: !!addressDatafromBech32({address: input})};
  } catch (e) {
    return {is_bech32: false};
  }
};

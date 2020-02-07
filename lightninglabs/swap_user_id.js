const {importMacaroon} = require('macaroon');

const expectedVersion = '0000';
const idLength = 32;
const paymentHashLength = 32;
const startIndex = 0;
const versionLength = 2;

/** Derive the swap user id from the swap macaroon

  {
    macaroon: <Base64 Encoded Macaroon String>
  }

  @throws
  <Error>

  @returns
  {
    id: <Swap User Id Hex String>
  }
*/
module.exports = ({macaroon}) => {
  // A macaroon is required to decode the user id
  if (!macaroon) {
    throw new Error('ExpectedMacaroonToDeriveSwapUserId');
  }

  const {identifier} = importMacaroon(macaroon);

  // Exit early with error when the identifier bytes don't match expectations
  if (identifier.length !== idLength + paymentHashLength + versionLength) {
    throw new Error('UnexpectedLengthForSwapMacaroonIdentifier');
  }

  const versionBytes = identifier.slice(startIndex, versionLength);

  // Exit early with error when the version is not known
  if (Buffer.from(versionBytes).toString('hex') !== expectedVersion) {
    throw new Error('UnknownVersionForSwapUserId');
  }

  const idStartIndex = paymentHashLength + versionLength;

  const id = identifier.slice(idStartIndex, idStartIndex + idLength);

  return {id: Buffer.from(id).toString('hex')};
};

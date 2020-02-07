const {parse} = require('@mitmaro/http-authorization-header');

const swapUserId = require('./swap_user_id');

const expectedScheme = 'LSAT';
const {isArray} = Array;
const macaroonKey = 'macaroon';
const requestKey = 'invoice';

/** Parse payment metadata

  {
    metadata: [<RFC 7235 Encoded Authentication Parameters String>]
  }

  @returns
  {
    [payment]: {
      id: <User Id Hex String>
      macaroon: <Base64 Serialized Macaroon String>
      request: <BOLT 11 Payment Request>
    }
  }
*/
module.exports = ({metadata}) => {
  // Exit early when there is no auth header
  if (!isArray(metadata) || !metadata.length) {
    return {};
  }

  const [auth] = metadata;

  try {
    parse(auth);
  } catch (err) {
    return {};
  }

  const {scheme, values} = parse(auth);

  // Exit early when the scheme is not correct
  if (scheme !== expectedScheme || !isArray(values)) {
    return {};
  }

  const macaroonTuple = values.find(n => {
    const [key] = n;

    return key === macaroonKey;
  });

  const [, macaroon] = macaroonTuple || [];

  // Exit early when the macaroon is missing
  if (!macaroon) {
    return {};
  }

  const requestTuple = values.find(n => {
    const [key] = n;

    return key === requestKey;
  });

  const [, request] = requestTuple || [];

  // Exit early when the request is missing
  if (!request) {
    return {};
  }

  try {
    swapUserId({macaroon});
  } catch (err) {
    return {};
  }

  const {id} = swapUserId({macaroon});

  return {payment: {id, macaroon, request}};
};

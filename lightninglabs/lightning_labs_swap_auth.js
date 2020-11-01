const grpc = require('@grpc/grpc-js');

const authHeader = 'Authorization';

/** Get authentication metadata for authenticating with Lightning Labs swaps

  {
    [macaroon]: <Base64 Encoded Macaroon String>
    [preimage]: <Authentication Preimage Hex String>
  }

  @returns
  {
    metadata: <Authentication Metadata Object>
  }
*/
module.exports = ({macaroon, preimage}) => {
  const metadata = new grpc.Metadata();

  if (!!macaroon) {
    metadata.add(authHeader, `LSAT ${macaroon}:${preimage}`);
  }

  return {metadata};
};

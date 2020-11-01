/** Get authentication metadata for authenticating with generic swap service

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
  const metadata = {
    get: () => {
      if (!macaroon) {
        return [String()];
      }

      return [`LSAT ${macaroon}:${preimage}`];
    },
  };

  return {metadata};
};

const {generateKeyPairSync} = require('node:crypto');
const {sign} = require('node:crypto');

const certBegin = '-----BEGIN CERTIFICATE-----';
const certEnd = '-----END CERTIFICATE-----';
const commonNameOid = '550403';
const dnsNameTag = 0x82;
const ecdsaWithSha256Oid = '2a8648ce3d040302';
const hexAsBuffer = hex => Buffer.from(hex, 'hex');
const ipAddressTag = 0x87;
const lines = buffer => buffer.toString('base64').match(/.{1,64}/g);
const localhost = 'localhost';
const loopbackAddress = '7f000001';
const namedCurve = 'prime256v1';
const serialNumber = '01';
const subjectAltNameOid = '551d11';
const tags = {
  bitString: 0x03,
  extensions: 0xa3,
  integer: 0x02,
  octetString: 0x04,
  oid: 0x06,
  sequence: 0x30,
  set: 0x31,
  utcTime: 0x17,
  utf8String: 0x0c,
  version: 0xa0,
};
const unusedBits = Buffer.alloc(1);
const validityMs = 1000 * 60 * 60 * 24;
const versionThree = '02';

// DER encode the length of contents, using the long form when it is needed
const derLength = size => {
  if (size < 0x80) {
    return Buffer.from([size]);
  }

  if (size < 0x100) {
    return Buffer.from([0x81, size]);
  }

  return Buffer.from([0x82, size >> 8, size & 0xff]);
};

// DER encode an element of a type with its contents
const der = (tag, ...contents) => {
  const body = Buffer.concat(contents);

  return Buffer.concat([Buffer.from([tag]), derLength(body.length), body]);
};

// DER encode a date as a UTC time: YYMMDDHHMMSSZ
const utcTime = date => {
  const digits = date.toISOString().slice(2, 19).replace(/[-T:]/g, '');

  return der(tags.utcTime, Buffer.from(`${digits}Z`));
};

/** Make a self-signed TLS certificate for a server on localhost

  {}

  @returns
  {
    cert: <PEM Encoded Certificate String>
    key: <PEM Encoded Private Key String>
  }
*/
module.exports = ({}) => {
  const {privateKey, publicKey} = generateKeyPairSync('ec', {namedCurve});

  const now = Date.now();

  const algorithm = der(
    tags.sequence,
    der(tags.oid, hexAsBuffer(ecdsaWithSha256Oid))
  );

  // The certificate is issued by and to localhost
  const name = der(
    tags.sequence,
    der(
      tags.set,
      der(
        tags.sequence,
        der(tags.oid, hexAsBuffer(commonNameOid)),
        der(tags.utf8String, Buffer.from(localhost))
      )
    )
  );

  // Clients can connect by the localhost name or the loopback address
  const altNames = der(
    tags.sequence,
    der(dnsNameTag, Buffer.from(localhost)),
    der(ipAddressTag, hexAsBuffer(loopbackAddress))
  );

  const extensions = der(
    tags.extensions,
    der(
      tags.sequence,
      der(
        tags.sequence,
        der(tags.oid, hexAsBuffer(subjectAltNameOid)),
        der(tags.octetString, altNames)
      )
    )
  );

  const tbs = der(
    tags.sequence,
    der(tags.version, der(tags.integer, hexAsBuffer(versionThree))),
    der(tags.integer, hexAsBuffer(serialNumber)),
    algorithm,
    name,
    der(
      tags.sequence,
      utcTime(new Date(now - validityMs)),
      utcTime(new Date(now + validityMs))
    ),
    name,
    publicKey.export({format: 'der', type: 'spki'}),
    extensions
  );

  // The certificate is signed with its own key
  const signature = sign('sha256', tbs, privateKey);

  const certificate = der(
    tags.sequence,
    tbs,
    algorithm,
    der(tags.bitString, unusedBits, signature)
  );

  // PEM encoding wraps the base64 certificate in 64 character lines
  const pem = [certBegin].concat(lines(certificate), certEnd, String());

  return {
    cert: pem.join('\n'),
    key: privateKey.export({format: 'pem', type: 'pkcs8'}),
  };
};

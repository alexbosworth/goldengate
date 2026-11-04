const majorMap = 5;
const majorText = 3;
const majorUint = 0;
const simpleUndefined = 0xf7;
const utf8 = 'utf8';

/** Encode a CBOR head: a major type with a minimally sized unsigned argument

  {
    major: <CBOR Major Type Number>
    n: <Unsigned Integer Argument Number>
  }

  @returns
  <CBOR Head Buffer Object>
*/
const head = ({major, n}) => {
  if (n < 24) {
    return Buffer.from([(major << 5) | n]);
  }

  if (n < 0x100) {
    return Buffer.from([(major << 5) | 24, n]);
  }

  if (n < 0x10000) {
    const buffer = Buffer.alloc(3, (major << 5) | 25);

    buffer.writeUInt16BE(n, 1);

    return buffer;
  }

  if (n < 0x100000000) {
    const buffer = Buffer.alloc(5, (major << 5) | 26);

    buffer.writeUInt32BE(n, 1);

    return buffer;
  }

  const buffer = Buffer.alloc(9, (major << 5) | 27);

  buffer.writeBigUInt64BE(BigInt(n), 1);

  return buffer;
};

/** Encode a flat map as CBOR

  Keys are encoded as text strings in insertion order. Values may be text
  strings, unsigned safe integers, or undefined. The output is byte for byte
  what the `cbor` package produces for the same map.

  {
    map: <Object>
  }

  @throws
  <Error>

  @returns
  {
    encoded: <CBOR Encoded Map Buffer Object>
  }
*/
module.exports = ({map}) => {
  const keys = Object.keys(map);

  const parts = keys.reduce((parts, key) => {
    const keyBytes = Buffer.from(key, utf8);
    const value = map[key];

    parts.push(head({major: majorText, n: keyBytes.length}), keyBytes);

    if (value === undefined) {
      parts.push(Buffer.from([simpleUndefined]));
    } else if (typeof value === 'string') {
      const bytes = Buffer.from(value, utf8);

      parts.push(head({major: majorText, n: bytes.length}), bytes);
    } else if (Number.isSafeInteger(value) && value >= 0) {
      parts.push(head({major: majorUint, n: value}));
    } else {
      throw new Error('UnsupportedValueTypeToEncodeAsCbor');
    }

    return parts;
  },
  [head({major: majorMap, n: keys.length})]);

  return {encoded: Buffer.concat(parts)};
};

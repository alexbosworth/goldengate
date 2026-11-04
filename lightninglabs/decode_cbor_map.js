const majorMap = 5;
const majorSimple = 7;
const majorText = 3;
const majorUint = 0;
const maxSafeInteger = BigInt(Number.MAX_SAFE_INTEGER);
const prototypeKey = '__proto__';
const simpleNull = 0xf6;
const simpleUndefined = 0xf7;
const utf8 = 'utf8';

/** Decode a CBOR encoded flat map

  Only a definite length map of text string keys with text string, unsigned
  integer, or undefined values is accepted, or a bare null or undefined. Any
  other CBOR construct is rejected.

  {
    encoded: <CBOR Encoded Map Buffer Object>
  }

  @throws
  <Error>

  @returns
  {
    decoded: <Decoded Map Object> | null | undefined
  }
*/
module.exports = ({encoded}) => {
  let offset = 0;

  const need = n => {
    if (offset + n > encoded.length) {
      throw new Error('UnexpectedEndOfCborInput');
    }
  };

  const readArgument = info => {
    if (info < 24) {
      return info;
    }

    if (info > 27) {
      throw new Error('UnsupportedCborAdditionalInformation');
    }

    const width = 1 << (info - 24);

    need(width);

    const value = width === 8 ?
      encoded.readBigUInt64BE(offset) : encoded.readUIntBE(offset, width);

    offset += width;

    if (value > maxSafeInteger) {
      throw new Error('UnsupportedCborIntegerSize');
    }

    return Number(value);
  };

  const readItem = isNested => {
    need(1);

    const byte = encoded[offset++];
    const info = byte & 0x1f;
    const major = byte >> 5;

    switch (major) {
    case majorUint:
      return readArgument(info);

    case majorText: {
      const length = readArgument(info);

      need(length);

      const text = encoded.toString(utf8, offset, offset + length);

      offset += length;

      return text;
    }

    case majorMap: {
      if (isNested) {
        throw new Error('UnsupportedNestedCborMap');
      }

      const count = readArgument(info);
      const map = {};

      for (let i = 0; i < count; i++) {
        const key = readItem(true);

        if (typeof key !== 'string' || key === prototypeKey) {
          throw new Error('UnsupportedCborMapKey');
        }

        map[key] = readItem(true);
      }

      return map;
    }

    case majorSimple:
      if (byte === simpleNull) {
        return null;
      }

      if (byte === simpleUndefined) {
        return undefined;
      }

      throw new Error('UnsupportedCborSimpleValue');

    default:
      throw new Error('UnsupportedCborMajorType');
    }
  };

  const decoded = readItem(false);

  if (offset !== encoded.length) {
    throw new Error('UnexpectedTrailingCborData');
  }

  return {decoded};
};

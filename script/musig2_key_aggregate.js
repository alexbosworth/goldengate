const {isPoint} = require('tiny-secp256k1');
const {pointAdd} = require('tiny-secp256k1');
const {pointMultiply} = require('tiny-secp256k1');

const taggedHash = require('./tagged_hash');

const bufferAsHex = buffer => Buffer.from(buffer).toString('hex');
const coefficientTag = 'KeyAgg coefficient';
const compressedPublicKeyHexLength = 66;
const {concat} = Buffer;
const curveOrderHigh = 'fffffffffffffffffffffffffffffffe';
const curveOrderLow = 'baaedce6af48a03bbfd25e8cd0364141';
const hexAsBuffer = hex => Buffer.from(hex, 'hex');
const {isArray} = Array;
const isCompressed = true;
const isHex = n => /^[0-9A-F]*$/i.test(n);
const listTag = 'KeyAgg list';

/** Aggregate public keys in the order given into a BIP 327 MuSig2 key

  {
    public_keys: [<Compressed Public Key Hex String>]
  }

  @throws
  <Error>

  @returns
  {
    public_key: <Aggregate Compressed Public Key Hex String>
  }
*/
module.exports = args => {
  if (!isArray(args.public_keys) || !args.public_keys.length) {
    throw new Error('ExpectedArrayOfPublicKeysToAggregateForMuSig2');
  }

  const isKey = n => isHex(n) && n.length === compressedPublicKeyHexLength;

  const isValidKey = key => isKey(key) && isPoint(hexAsBuffer(key));

  if (args.public_keys.some(key => !isValidKey(key))) {
    throw new Error('ExpectedValidCompressedPublicKeysToAggregateForMuSig2');
  }

  const keys = args.public_keys.map(n => hexAsBuffer(n));

  const curveOrder = BigInt(`0x${curveOrderHigh}${curveOrderLow}`);

  const hashAsScalar = hash => BigInt(`0x${bufferAsHex(hash)}`) % curveOrder;

  const scalarAsBuffer = n => hexAsBuffer(n.toString(16).padStart(64, '0'));

  // The list hash commits to every key in aggregation order
  const listHash = taggedHash({message: concat(keys), tag: listTag});

  const [firstKey] = keys;

  // The second distinct key in the list has a coefficient of one
  const secondKey = keys.find(key => !key.equals(firstKey));

  const coefficients = keys.map(key => {
    if (!!secondKey && key.equals(secondKey)) {
      return BigInt(1);
    }

    const preimage = concat([listHash, key]);

    return hashAsScalar(taggedHash({message: preimage, tag: coefficientTag}));
  });

  // Sum the keys times their coefficients, using null as the point at infinity
  const aggregate = keys.reduce((sum, key, i) => {
    const point = pointMultiply(key, scalarAsBuffer(coefficients[i]));

    // Exit early when either side of the addition is the point at infinity
    if (!sum || !point) {
      return sum || point;
    }

    return pointAdd(sum, point, isCompressed);
  },
  null);

  if (!aggregate) {
    throw new Error('ExpectedNonInfinityAggregatePublicKeyForMuSig2');
  }

  return {public_key: bufferAsHex(aggregate)};
};

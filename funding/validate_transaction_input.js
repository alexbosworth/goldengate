const {address} = require('bitcoinjs-lib');
const {decodePsbt} = require('psbt');
const {Transaction} = require('bitcoinjs-lib');

const bech32AddressAsScript = require('./bech32_address_as_script');
const isBase64Encoded = require('./is_base64_encoded');
const isEncodedTransaction = require('./is_encoded_transaction');
const isPsbtEncoded = require('./is_psbt_encoded');

const base64AsHex = base64 => Buffer.from(base64, 'base64').toString('hex');
const bigTok = ({tokens}) => (tokens / 1e8).toFixed(8);
const hasValue = (output, tokens) => output.value === tokens;
const hasScript = (output, script) => output.script.equals(script);
const hexAsBuffer = hex => Buffer.from(hex, 'hex');
const isBase64 = input => isBase64Encoded({input}).is_base64;
const isHex = n => !(n.length % 2) && /^[0-9A-F]*$/i.test(n);
const isPsbt = input => isPsbtEncoded({input}).is_psbt;
const isTx = input => isEncodedTransaction({input}).is_transaction;
const notFoundIndex = -1;
const txFromHex = hex => Transaction.fromHex(hex);
const txFromPsbt = psbt => decodePsbt({psbt}).unsigned_transaction;
const txIdHexLength = 64;

/** Validate that an external transaction is in an acceptable format

  {
    input: <External Transaction Data Input String>
    outputs: [{
      address: <Expected Output Address String>s
      tokens: <Expected Tokens Count Number>
    }]
  }

  @returns
  {
    valid: <Error Message String Or Is Valid Boolean>
  }
*/
module.exports = ({input, outputs}) => {
  // Exit early on no input to return a deliberate error
  if (!input) {
    return {valid: true};
  }

  const funding = input.trim();

  // Exit early with a specific error for someone trying to put in a tx id
  if (funding.length === txIdHexLength) {
    return {valid: 'Enter full transaction data, not a transaction id'};
  }

  const isValidBase64 = isBase64(funding);
  const isValidHex = isHex(funding);

  // Exit early when the data encoding isn't recognized
  if (!isValidBase64 && !isValidHex) {
    return {valid: 'Enter transaction data in hex or base64 encoding'};
  }

  const hex = isValidHex ? funding : base64AsHex(funding);

  const isValidPsbt = isPsbt(hex);
  const isValidTx = isTx(hex);

  // Exit early when the data doesn't look like a TX or a PSBT
  if (!isValidPsbt && !isValidTx) {
    return {valid: 'Enter a valid PSBT or raw signed transaction'};
  }

  // Parse the transaction outputs out of the data
  const {outs} = isValidTx ? txFromHex(hex) : txFromHex(txFromPsbt(hex));

  // Map the output addresses to scripts to allow for easier out script search
  const outputsWithScripts = outputs.map(({address, tokens}) => {
    return {
      address,
      script: hexAsBuffer(bech32AddressAsScript({address}).script),
      tokens: Number(tokens),
    };
  });

  // Look through the transaction to find any required outputs that are missing
  const missingOutput = outputsWithScripts.findIndex(({script, tokens}) => {
    return !outs.find(n => hasValue(n, tokens) && hasScript(n, script));
  });

  const missing = outputs[missingOutput];

  // Exit early when an expected output is not present
  if (missingOutput !== notFoundIndex) {
    return {valid: `Missing send of ${bigTok(missing)} to ${missing.address}`};
  }

  return {valid: true};
};

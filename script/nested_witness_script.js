const {crypto} = require('bitcoinjs-lib');
const {encode} = require('varuint-bitcoin');
const {OP_0} = require('bitcoin-ops');
const {script} = require('bitcoinjs-lib');

const compileScript = elements => script.compile(elements).toString('hex');
const sha256 = hex => crypto.sha256(Buffer.from(hex, 'hex'));
const witnessVersion = encode(OP_0).toString('hex');

/** Get a scriptSig-nested witness script

  {
    witness_script: <Witness Program Hex String>
  }

  @throws
  <Error>

  @returns
  {
    redeem_script: <Redeem Script Hex String>
  }
*/
module.exports = args => {
  if (!args.witness_script) {
    throw new Error('ExpectedWitnessProgramToCreatedNestedScriptSig');
  }

  const nestComponents = [witnessVersion, sha256(args.witness_script)];

  const nest = Buffer.from(compileScript(nestComponents), 'hex');

  return {redeem_script: compileScript([nest])};
};

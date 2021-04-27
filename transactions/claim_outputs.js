const {address} = require('bitcoinjs-lib');
const {networks} = require('bitcoinjs-lib');
const {Transaction} = require('bitcoinjs-lib');

const estimateTxWeight = require('./estimate_tx_weight');
const {names} = require('./../conf/bitcoinjs-lib');

const {ceil} = Math;
const dust = 546;
const {isArray} = Array;
const {max} = Math;
const notFoundIndex = -1;
const secretByteLength = 32;
const {toOutputScript} = address;
const txIdByteLength = 32;
const vRatio = 4;

/** Determine outputs for a claim transaction

  Optional send addresses can be specified, but they will all be ignored
  if they will bring the final output amount down below the dust amount

  {
    address: <Sweep Address String>
    network: <Network Name String>
    rate: <Fee Rate Tokens Per VByte Number>
    sends: [{
      address: <Delivery Address String>
      tokens: <Send Tokens Number>
    }]
    script: <Witness Script Hex String>
    tokens: <Sweep Tokens Number>
  }

  @throws
  <Error>

  @returns
  {
    outputs: [{
      address: <Output Address String>
      tokens: <Output Tokens Number>
    }]
  }
*/
module.exports = ({address, network, rate, sends, script, tokens}) => {
  if (!address) {
    throw new Error('ExpectedSweepAddressToCalculateClaimOutputs');
  }

  if (!network) {
    throw new Error('ExpectedNetworkNameToCalculateClaimOutputs');
  }

  if (!rate) {
    throw new Error('ExpectedFeeRateToCalculateClaimOutputs');
  }

  if (!isArray(sends)) {
    throw new Error('ExpectedArrayOfSendsToCalculateClaimOutputs');
  }

  if (sends.findIndex(n => !n) !== notFoundIndex) {
    throw new Error('ExpectedOutputsToCalculateClaimOutputs');
  }

  if (!!sends.find(n => !n.address)) {
    throw new Error('ExpectedAddressInSendsArrayToCalculateClaimOutputs');
  }

  if (!!sends.find(n => !n.tokens)) {
    throw new Error('ExpectedTokensInSendsArrayToCalculateClaimOutputs');
  }

  if (!tokens) {
    throw new Error('ExpectedTokensToCalculateClaimOutputs');
  }

  const net = networks[names[network]];
  const tx = new Transaction();

  // Add UTXO to tx
  tx.addInput(Buffer.alloc(txIdByteLength), Number());

  // Add sweep outputs
  try {
    tx.addOutput(toOutputScript(address, networks[names[network]]), tokens);
  } catch (err) {
    throw new Error('FailedToAddSweepAddressOutputScriptCalculatingOutputs');
  }

  // Estimate final weight with the single output
  const singleOutput = estimateTxWeight({
    unlock: Buffer.alloc(secretByteLength),
    weight: tx.weight(),
    witness_script: script,
  });

  const singleOutputFee = rate * ceil(singleOutput.weight / vRatio);

  const defaultOutputs = [{
    address,
    tokens: max(dust + dust, ceil(tokens - singleOutputFee)),
  }];

  // Exit early when there are no additional outputs to attach
  if (!sends.length) {
    return {outputs: defaultOutputs};
  }

  // Figure out which additional outputs can be attached
  const outs = sends.filter(out => {
    if (out.tokens <= dust) {
      return false;
    }

    try {
      toOutputScript(out.address, networks[names[network]]);
    } catch (err) {
      return false;
    }

    return true;
  });

  // Attach the extra desired outputs
  outs.forEach(out => {
    const scriptPub = toOutputScript(out.address, networks[names[network]]);

    return tx.addOutput(scriptPub, out.tokens);
  });

  // Estimate the final weight with the additional output attachments
  const multiOutput = estimateTxWeight({
    unlock: Buffer.alloc(secretByteLength),
    weight: tx.weight(),
    witness_script: script,
  });

  const multiOutputFee = rate * ceil(multiOutput.weight / vRatio);
  const multiOutputValue = outs.reduce((sum, n) => sum + n.tokens, Number());

  const multiOutputSweepValue = tokens - multiOutputFee - multiOutputValue;

  // Exit early and abandon extra outputs when there isn't enough left for fees
  if (multiOutputSweepValue <= dust) {
    return {outputs: defaultOutputs};
  }

  const sweep = {
    address,
    tokens: ceil(tokens - multiOutputFee - multiOutputValue),
  };

  return {outputs: [].concat([sweep]).concat(outs)};
};

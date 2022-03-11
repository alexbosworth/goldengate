const {address} = require('bitcoinjs-lib');
const {networks} = require('bitcoinjs-lib');
const {Transaction} = require('bitcoinjs-lib');

const {names} = require('./../conf/bitcoinjs-lib');
const predictSweepWeight = require('./predict_sweep_weight');

const bufferAsHex = buffer => buffer.toString('hex');
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
    [control]: <Control Block Hex String>
    network: <Network Name String>
    rate: <Fee Rate Tokens Per VByte Number>
    sends: [{
      address: <Delivery Address String>
      tokens: <Send Tokens Number>
    }]
    [script]: <Witness Script Hex String>
    tokens: <Sweep Tokens Number>
  }

  @throws
  <Error>

  @returns
  {
    outputs: [{
      script: <Output Script String>
      tokens: <Output Tokens Number>
    }]
  }
*/
module.exports = args => {
  if (!args.address) {
    throw new Error('ExpectedSweepAddressToCalculateTaprootClaimOutputs');
  }

  if (!args.network) {
    throw new Error('ExpectedNetworkNameToCalculateTaprootClaimOutputs');
  }

  if (!args.rate) {
    throw new Error('ExpectedFeeRateToCalculateTaprootClaimOutputs');
  }

  if (!isArray(args.sends)) {
    throw new Error('ExpectedArrayOfSendsToCalculateTaprootClaimOutputs');
  }

  if (args.sends.findIndex(n => !n) !== notFoundIndex) {
    throw new Error('ExpectedOutputsToCalculateTaprootClaimOutputs');
  }

  if (!!args.sends.find(n => !n.address)) {
    throw new Error('ExpectedAddressInSendsToCalculateTaprootClaimOutputs');
  }

  if (!!args.sends.find(n => !n.tokens)) {
    throw new Error('ExpectedTokensInSendsToCalculateTaprootClaimOutputs');
  }

  if (!args.tokens) {
    throw new Error('ExpectedTokensToCalculateTaprootClaimOutputs');
  }

  const network = networks[names[args.network]];
  const tx = new Transaction();

  // Add a dummy UTXO to the tx
  tx.addInput(Buffer.alloc(txIdByteLength), Number());

  // Add the sweep output
  try {
    tx.addOutput(toOutputScript(args.address, network), args.tokens);
  } catch (err) {
    throw new Error('FailedToAddSweepAddressOutputCalculatingTaprootOutputs');
  }

  // Estimate final weight with the single output
  const singleOutput = predictSweepWeight({
    control: args.control,
    unlock: Buffer.alloc(secretByteLength),
    weight: tx.weight(),
    script: args.script,
  });

  const singleOutputFee = args.rate * ceil(singleOutput.weight / vRatio);

  const defaultOutputs = [{
    script: bufferAsHex(toOutputScript(args.address, network)),
    tokens: max(dust + dust, ceil(args.tokens - singleOutputFee)),
  }];

  // Exit early when there are no additional outputs to attach
  if (!args.sends.length) {
    return {outputs: defaultOutputs};
  }

  // Figure out which additional outputs can be attached
  const outs = args.sends.filter(out => {
    if (out.tokens <= dust) {
      return false;
    }

    try {
      toOutputScript(out.address, network);
    } catch (err) {
      return false;
    }

    return true;
  });

  // Attach the extra desired outputs
  outs.forEach(out => {
    const scriptPub = toOutputScript(out.address, network);

    return tx.addOutput(scriptPub, out.tokens);
  });

  // Estimate the final weight with the additional output attachments
  const multiOutput = predictSweepWeight({
    control: args.control,
    script: args.script,
    unlock: Buffer.alloc(secretByteLength),
    weight: tx.weight(),
  });

  const multiOutputFee = args.rate * ceil(multiOutput.weight / vRatio);
  const multiOutputValue = outs.reduce((sum, n) => sum + n.tokens, Number());

  const multiSweepValue = args.tokens - multiOutputFee - multiOutputValue;

  // Exit early and abandon extra outputs when there isn't enough left for fees
  if (multiSweepValue <= dust) {
    return {outputs: defaultOutputs};
  }

  const sweep = {
    address: args.address,
    tokens: ceil(args.tokens - multiOutputFee - multiOutputValue),
  };

  const outputs = [].concat([sweep]).concat(outs);

  return outputs.map(output => ({
    script: bufferAsHex(toOutputScript(output.address, network)),
    tokens: output.tokens,
  }));

  return {outputs};
};

const {outputScriptForAddress} = require('@alexbosworth/blockchain');
const {sizeOfTransaction} = require('@alexbosworth/blockchain');

const {encodeTransaction} = require('./../transactions');
const predictSweepWeight = require('./predict_sweep_weight');

const asOut = (address, network) => outputScriptForAddress({address, network});
const {ceil} = Math;
const defaultSequence = 0xffffffff;
const defaultVersion = 1;
const dummyTxId = Buffer.alloc(32).toString('hex');
const dust = 546;
const emptyScript = '';
const {isArray} = Array;
const {max} = Math;
const notFoundIndex = -1;
const secretByteLength = 32;
const vRatio = 4;
const weightOf = tx => sizeOfTransaction(encodeTransaction(tx)).weight;

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

  // Add a dummy UTXO to the tx
  const tx = {
    inputs: [{
      id: dummyTxId,
      script: emptyScript,
      sequence: defaultSequence,
      vout: Number(),
    }],
    locktime: Number(),
    outputs: [],
    version: defaultVersion,
  };

  // Add the sweep output
  try {
    const outputScript = asOut(args.address, args.network).script;

    tx.outputs.push({script: outputScript, tokens: args.tokens});

    // Make sure the sweep output can be encoded
    encodeTransaction(tx);
  } catch (err) {
    throw new Error('FailedToAddSweepAddressOutputCalculatingTaprootOutputs');
  }

  // Estimate final weight with the single output
  const singleOutput = predictSweepWeight({
    control: args.control,
    unlock: Buffer.alloc(secretByteLength),
    weight: weightOf(tx),
    script: args.script,
  });

  const singleOutputFee = args.rate * ceil(singleOutput.weight / vRatio);

  const defaultOutputs = [{
    script: asOut(args.address, args.network).script,
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
      asOut(out.address, args.network);
    } catch (err) {
      return false;
    }

    return true;
  });

  // Attach the extra desired outputs
  outs.forEach(out => {
    const scriptPub = asOut(out.address, args.network).script;

    return tx.outputs.push({script: scriptPub, tokens: out.tokens});
  });

  // Estimate the final weight with the additional output attachments
  const multiOutput = predictSweepWeight({
    control: args.control,
    script: args.script,
    unlock: Buffer.alloc(secretByteLength),
    weight: weightOf(tx),
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

  return {
    outputs: outputs.map(output => ({
      script: asOut(output.address, args.network).script,
      tokens: output.tokens,
    })),
  };
};

const asyncAuto = require('async/auto');
const {getChainFeeRate} = require('ln-service');
const {returnResult} = require('asyncjs-util');

const fastConfirmationTarget = 2;
const {floor} = Math;
const maxMultiplier = 100;
const slowConfirmationTarget = 1e3;

/** Ask to get a chain fee rate

  {
    ask: <Inquirer Ask Function>
    lnd: <Authenticated LND API Object>
  }

  @returns via cbk or Promise
  {
    tokens_per_vbyte: <Chain Fee Tokens Per VByte Number>
  }
*/
module.exports = ({ask, lnd}, cbk) => {
  return new Promise((resolve, reject) => {
    return asyncAuto({
      // Check arguments
      validate: cbk => {
        if (!ask) {
          return cbk([400, 'ExpectedAskFunctionToAskForChainFeeRate']);
        }

        if (!lnd) {
          return cbk([400, 'ExpectedAuthenticatedLndToAskForChainFeeRate']);
        }

        return cbk();
      },

      // Get the default chain fee rate
      getDefaultChainFeeRate: ['validate', ({}, cbk) => {
        return getChainFeeRate({lnd}, cbk);
      }],

      // Get the maximum chain fee rate
      getMaxChainFeeRate: ['validate', ({}, cbk) => {
        return getChainFeeRate({
          lnd,
          confirmation_target: fastConfirmationTarget,
        },
        cbk);
      }],

      // Get the minimum chain fee rate
      getMinChainFeeRate: ['validate', ({}, cbk) => {
        return getChainFeeRate({
          lnd,
          confirmation_target: slowConfirmationTarget,
        },
        cbk);
      }],

      // Ask for fee rate to use for internal funding
      askForFeeRate: [
        'getDefaultChainFeeRate',
        'getMaxChainFeeRate',
        'getMinChainFeeRate',
        ({
          getDefaultChainFeeRate,
          getMaxChainFeeRate,
          getMinChainFeeRate,
        },
        cbk) =>
      {
        return ask({
          default: floor(getDefaultChainFeeRate.tokens_per_vbyte),
          message: 'Chain fee per vbyte?',
          name: 'rate',
          type: 'number',
        },
        ({rate}) => cbk(null, rate));
      }],

      // Sanity check fee rate input
      checkRate: [
        'askForFeeRate',
        'getMaxChainFeeRate',
        'getMinChainFeeRate',
        ({askForFeeRate, getMaxChainFeeRate, getMinChainFeeRate}, cbk) =>
      {
        const maxFee = getMaxChainFeeRate.tokens_per_vbyte * maxMultiplier;
        const minFee = floor(getMinChainFeeRate.tokens_per_vbyte);

        // A chain fee of some amount is expected
        if (!askForFeeRate) {
          return cbk([400, 'ExpectedChainFeeRate']);
        }

        // Chain fee cannot be crazy high
        if (askForFeeRate > maxFee) {
          return cbk([400, 'MaxFeePerVbyteExceeded', {maximum: maxFee}]);
        }

        // Chain fee has to be some minimal amount
        if (askForFeeRate < minFee) {
          return cbk([400, 'ExpectedHigherMinFeePerVbyte', {minimum: minFee}]);
        }

        return cbk();
      }],

      // Final fee rate
      rate: ['askForFeeRate', 'checkRate', ({askForFeeRate}, cbk) => {
        return cbk(null, {tokens_per_vbyte: askForFeeRate});
      }],
    },
    returnResult({reject, resolve, of: 'rate'}, cbk));
  });
};

const {address} = require('bitcoinjs-lib');
const asyncAuto = require('async/auto');
const {decodePsbt} = require('psbt');
const {returnResult} = require('asyncjs-util');
const {Transaction} = require('bitcoinjs-lib');

const isBech32Encoded = require('./is_bech32_encoded');
const transactionFromPsbt = require('./transaction_from_psbt');
const validateTransactionInput = require('./validate_transaction_input');

const base64AsHex = base64 => Buffer.from(base64, 'base64').toString('hex');
const {fromHex} = Transaction;
const interrogationSeparator = ' and \n  ';
const {isArray} = Array;
const isBech32 = input => isBech32Encoded({input}).is_bech32;
const isHex = n => !(n.length % 2) && /^[0-9A-F]*$/i.test(n);
const notFoundIndex = -1;
const or = 'or press enter to cancel funding.\n';
const tokAsBigUnit = tokens => (tokens / 1e8).toFixed(8);

/** Get a funded transaction from an external source

  {
    ask: <Inquirer Ask Function>
    logger: <Winston Logger Object>
    outputs: [{
      address: <Bech32 Chain Address String>
      tokens: <Send Tokens Tokens Number>
    }]
  }

  @returns via cbk or Promise
  {
    id: <Transaction Id Hex String>
    [psbt]: <Finalized PSBT Hex String>
    [transaction]: <Signed Raw Transaction Hex String>
  }
*/
module.exports = ({ask, logger, outputs}, cbk) => {
  return new Promise((resolve, reject) => {
    return asyncAuto({
      // Check arguments
      validate: cbk => {
        if (!ask) {
          return cbk([400, 'ExpectedAskFunctionToGetExternallyFundedTx']);
        }

        if (!logger) {
          return cbk([400, 'ExpectedWinstonLoggerToGetExternallyFundedTx']);
        }

        if (!isArray(outputs)) {
          return cbk([400, 'ExpectedArrayOfOutputsToGetExternallyFundedTx']);
        }

        if (outputs.findIndex(n => !isBech32(n.address)) !== notFoundIndex) {
          return cbk([400, 'ExpectedBech32AddressesForTransactionOutputs']);
        }

        return cbk();
      },

      // Prompt for a PSBT or a signed transaction
      getFunding: ['validate', ({}, cbk) => {
        const fundSends = outputs.map(n => `${n.address} ${n.tokens}`);

        logger.info({fund: `fund ${fundSends.join(' ')}`});

        const commaSends = outputs.map(({address, tokens}) => {
          return `${address}, ${tokAsBigUnit(tokens)}`;
        });

        logger.info(`\n${commaSends.join('\n')}\n`);

        const payTo = outputs
          .map(n => `${tokAsBigUnit(n.tokens)} to ${n.address}`)
          .join(interrogationSeparator);

        const funding = {
          message: `Enter signed transaction or PSBT that pays ${payTo} ${or}`,
          name: 'fund',
          validate: input => validateTransactionInput({input, outputs}).valid,
        };

        return ask(funding, ({fund}) => cbk(null, fund));
      }],

      // Translate funding data into hex
      fundingHex: ['getFunding', ({getFunding}, cbk) => {
        const funding = getFunding.trim();

        // Exit early when there is no funding
        if (!funding) {
          return cbk([400, 'ExpectedFundingTransaction']);
        }

        // Exit early when funding data is already hex
        if (isHex(funding)) {
          return cbk(null, funding);
        }

        return cbk(null, base64AsHex(funding));
      }],

      // Final funding result
      funding: ['fundingHex', ({fundingHex}, cbk) => {
        // Exit when the hex is a PSBT
        try {
          const decoded = decodePsbt({psbt: fundingHex});

          const id = fromHex(decoded.unsigned_transaction).getId();

          // Attempt to extract the raw tx from the provided PSBT
          const {transaction} = transactionFromPsbt({psbt: fundingHex});

          // The funding is a PSBT
          return cbk(null, {id, transaction, psbt: fundingHex});
        } catch (err) {}

        // A raw TX is expected
        try {
          const tx = fromHex(fundingHex);

          const id = tx.getId();

          // The funding is a raw transaction
          return cbk(null, {id, transaction: fundingHex});
        } catch (err) {
          return cbk([400, 'ExpectedValidTransactionInput']);
        }
      }],
    },
    returnResult({reject, resolve, of: 'funding'}, cbk));
  });
};

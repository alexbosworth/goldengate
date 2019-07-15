const asyncAuto = require('async/auto');
const {broadcastChainTransaction} = require('ln-service');
const {returnResult} = require('asyncjs-util');
const {Transaction} = require('bitcoinjs-lib');

const {publishTxToBlockstream} = require('./../blockstream');

const {fromHex} = Transaction;

/** Broadcast a transaction to the miners to be published to the Blockchain

  Either a request object or a wallet rpc lnd gRPC object is required

  {
    [lnd]: <Wallet RPC LND GRPC API Object>
    network: <Network Name String>
    [request]: <Request Function>
    transaction: <Raw Transaction Hex String>
  }

  @returns via cbk
  {
    transaction_id: <Transaction Id Hex String>
  }
*/
module.exports = ({lnd, network, request, transaction}, cbk) => {
  return asyncAuto({
    // Check arguments
    validate: cbk => {
      if (!lnd && !request) {
        return cbk([400, 'ExpectedRequestFunctionOrLndGrpcApiObject']);
      }

      if (!network) {
        return cbk([400, 'ExpectedValidNetworkToPublishTransaction']);
      }

      try {
        fromHex(transaction);
      } catch (err) {
        return cbk([400, 'ExpectedValidTransactionToPublish', {err}]);
      }

      return cbk();
    },

    // Publish to the mempool via Blockstream API
    blockstreamPublish: ['validate', ({}, cbk) => {
      if (!request) {
        return cbk();
      }

      return publishTxToBlockstream({network, request, transaction}, err => {
        return cbk(null, {err, is_success: !err});
      });
    }],

    // Publish via the wallet lnd RPC connection
    lndPublish: ['validate', ({}, cbk) => {
      if (!lnd) {
        return cbk();
      }

      return broadcastChainTransaction({lnd, transaction}, err => {
        return cbk(null, {err, is_success: !err});
      });
    }],

    // Transaction id for published transaction
    transactionId: [
      'blockstreamPublish',
      'lndPublish',
      ({blockstreamPublish, lndPublish}, cbk) =>
    {
      const failedPublish = [blockstreamPublish, lndPublish].find(publish => {
        return !!publish && !!publish.err;
      });

      const successPublish = [blockstreamPublish, lndPublish].find(publish => {
        return !!publish && publish.is_success === true;
      });

      if (!successPublish) {
        return cbk(failedPublish.err || [500, 'FailedToPublishTx']);
      }

      return cbk(null, {transaction_id: fromHex(transaction).getId()});
    }],
  },
  returnResult({of: 'transactionId'}, cbk));
};

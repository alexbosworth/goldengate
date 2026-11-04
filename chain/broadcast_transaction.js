const asyncAuto = require('async/auto');
const asyncify = require('async/asyncify');
const {broadcastChainTransaction} = require('ln-service');
const {idForTransaction} = require('@alexbosworth/blockchain');
const {returnResult} = require('asyncjs-util');

const {publishTxToBlockstream} = require('./../blockstream');

const txId = transaction => idForTransaction({transaction}).id;

/** Broadcast a transaction to the miners to be published to the Blockchain

  Either a request object or a wallet rpc lnd gRPC object is required

  Network is required if request is specified

  {
    [lnd]: <Wallet RPC LND GRPC API Object>
    [network]: <Network Name String>
    [request]: <Request Function>
    transaction: <Raw Transaction Hex String>
  }

  @returns via cbk or Promise
  {
    transaction_id: <Transaction Id Hex String>
  }
*/
module.exports = ({lnd, network, request, transaction}, cbk) => {
  return new Promise((resolve, reject) => {
    return asyncAuto({
      // Check arguments
      validate: cbk => {
        if (!lnd && !request) {
          return cbk([400, 'ExpectedRequestFunctionOrLndGrpcApiObject']);
        }

        if (!network && !!request) {
          return cbk([400, 'ExpectedNetworkToPublishTransaction']);
        }

        return cbk();
      },

      // Derive the id of the transaction to publish
      id: ['validate', asyncify(({}) => {
        try {
          return txId(transaction);
        } catch (err) {
          throw [400, 'ExpectedValidTransactionToPublish', {err}];
        }
      })],

      // Publish to the mempool via Blockstream API
      blockstreamPublish: ['id', ({}, cbk) => {
        if (!request) {
          return cbk();
        }

        return publishTxToBlockstream({network, request, transaction}, err => {
          return cbk(null, {err, is_success: !err});
        });
      }],

      // Publish via the wallet lnd RPC connection
      lndPublish: ['id', ({}, cbk) => {
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
        'id',
        'lndPublish',
        ({blockstreamPublish, id, lndPublish}, cbk) =>
      {
        const pushes = [blockstreamPublish, lndPublish];

        const failedPublish = pushes.find(n => !!n && !!n.err);
        const successPublish = pushes.find(n => !!n && n.is_success === true);

        if (!successPublish) {
          return cbk(failedPublish.err);
        }

        return cbk(null, {transaction_id: id});
      }],
    },
    returnResult({reject, resolve, of: 'transactionId'}, cbk));
  });
};

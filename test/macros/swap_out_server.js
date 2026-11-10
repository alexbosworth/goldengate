const {createHash} = require('node:crypto');
const {randomBytes} = require('node:crypto');

const asyncEachSeries = require('async/eachSeries');
const {beginGroupSigningSession} = require('ln-service');
const {cancelHodlInvoice} = require('ln-service');
const {componentsOfTransaction} = require('@alexbosworth/blockchain');
const {controlBlock} = require('p2tr');
const {createHodlInvoice} = require('ln-service');
const {decodePsbt} = require('psbt');
const {endGroupSigningSession} = require('ln-service');
const {getInvoice} = require('ln-service');
const {getPublicKey} = require('ln-service');
const {getWalletInfo} = require('ln-service');
const {hashForTree} = require('p2tr');
const {outputScriptForAddress} = require('@alexbosworth/blockchain');
const {parsePaymentRequest} = require('ln-service');
const {sendToChainOutputScripts} = require('ln-service');
const {settleHodlInvoice} = require('ln-service');
const {signTransaction} = require('ln-service');
const {updateGroupSigningSession} = require('ln-service');
const {v1HashToSign} = require('p2tr');
const {v1OutputScript} = require('p2tr');

const {addressForScript} = require('./../../script');
const {broadcastTransaction} = require('./../../chain');
const {encodeTransaction} = require('./../../transactions');
const grpcSwapServer = require('./grpc_swap_server');
const {makePrivateKey} = require('./../../script');
const {refundTransaction} = require('./../../transactions');
const swapKey = require('./../../script/get_public_key');
const {swapScriptBranches} = require('./../../script');
const {swapScriptV2} = require('./../../script');
const {taprootRefundTransaction} = require('./../../taproot');
const xOnlyPublicKey = require('./../../taproot/x_only_public_key');

const bufferAsHex = buffer => Buffer.from(buffer).toString('hex');
const defaultMaxCltvDelta = 1000;
const defaultMaxTokens = 1e7;
const defaultMinTokens = 1e4;
const feeRate = 2;
const hexAsBuffer = hex => Buffer.from(hex, 'hex');
const invoiceCanceled = 'SERVER_CLIENT_INVOICE_CANCEL';
const invoiceCltvDelta = 400;
const methodNames = [
  'cancelLoopOutSwap',
  'loopOutPushPreimage',
  'loopOutQuote',
  'loopOutTerms',
  'muSig2SignSweep',
  'newLoopOutSwap',
  'subscribeLoopOutUpdates',
];
const nsPerMs = BigInt(1e6);
const outpoint = n => `${n.transaction_id}:${n.transaction_vout}`;
const prepayCanceled = 'SERVER_CLIENT_PREPAY_CANCEL';
const prepayRoute = 'PREPAY_ROUTE';
const sha256 = buffer => createHash('sha256').update(buffer).digest('hex');
const sighashDefault = 0;
const taprootVersion = 'MUSIG2';

const paymentOf = request => parsePaymentRequest({request}).payment;

// Find the preimage of a hash in the witness of a transaction
const preimageIn = ({hash, transaction}) => {
  const {inputs} = componentsOfTransaction({transaction});

  const elements = [].concat(...inputs.map(input => input.witness || []));

  return elements.find(n => sha256(hexAsBuffer(n)) === hash);
};

/** Start a swap out server that pays out on chain with an LND, over gRPC

  {
    cltv_delta: <Swap HTLC Timeout Height Delta Blocks Number>
    fee: <Swap Fee Tokens Number>
    key_family: <Service Key Family Number>
    lnd: <Service Authenticated LND API Object>
    [max_cltv_delta]: <Maximum Swap HTLC Timeout Delta Blocks Number>
    [max_tokens]: <Maximum Swap Tokens Number>
    [min_tokens]: <Minimum Swap Tokens Number>
    network: <Network Name String>
    prepay: <Prepay Tokens Number>
  }

  @returns via Promise
  {
    cert: <Base64 Encoded TLS Certificate String>
    fail: <Fail Swap Function> ({id, state}) => <Promise>
    publish: <Publish Swap HTLC Function> ({id, [tokens]}) => <Promise> {
      tokens: <HTLC Output Tokens Number>
      transaction: <HTLC Funding Transaction Hex String>
      transaction_id: <HTLC Funding Transaction Id Hex String>
      transaction_vout: <HTLC Output Index Number>
    }
    refund: <Refund Swap HTLC Function> ({address, id}) => <Promise> {
      transaction: <Refund Transaction Hex String>
    }
    requests: {
      <Method Name String>: [<Request Object>]
    }
    settle: <Settle Swap Payment Function> ({id, secret}) => <Promise>
    settleFromClaim: <Settle With Claim Function> ({id, transaction}) => {}
    socket: <Server Socket String>
    stop: <Stop Server Function> () => {}
    update: <Send Swap Status Function> ({id, state}) => {}
  }
*/
module.exports = async args => {
  const requests = methodNames.reduce((sum, n) => ({...sum, [n]: []}), {});
  const swaps = {};

  const wallet = await getWalletInfo({lnd: args.lnd});

  // Send a status of a swap to the clients that are subscribed to it
  const update = ({id, state}) => {
    const swap = swaps[id];

    const timestamp = BigInt(Date.now()) * nsPerMs;

    const status = {state, timestamp_ns: timestamp.toString()};

    swap.states.push(status);

    return swap.subscribers.forEach(call => call.write(status));
  };

  // Cancel the swap payments that are not settled, so they fail back
  const cancelPayments = async ({id}) => {
    const {fund, prepay} = swaps[id];

    return await asyncEachSeries([fund.id, prepay.id], async invoiceId => {
      const invoice = await getInvoice({id: invoiceId, lnd: args.lnd});

      // Exit early when the payment is already settled
      if (invoice.is_confirmed) {
        return;
      }

      return await cancelHodlInvoice({id: invoiceId, lnd: args.lnd});
    });
  };

  // Settle the swap payment with its preimage, the swap is then a success
  const settle = async ({id, secret}) => {
    await settleHodlInvoice({secret, lnd: args.lnd});

    swaps[id].is_paid = true;

    return update({id, state: 'SERVER_SUCCESS'});
  };

  // A P2WSH HTLC has a refund key that the service keeps itself
  const legacyHtlc = async ({request}) => {
    const privateKey = makePrivateKey({}).private_key;

    const key = swapKey({private_key: privateKey});

    const {script} = swapScriptV2({
      claim_public_key: bufferAsHex(request.receiver_key),
      hash: bufferAsHex(request.swap_hash),
      refund_public_key: key.public_key,
      timeout: request.expiry,
    });

    const {address} = addressForScript({script, network: args.network});

    const output = outputScriptForAddress({address, network: args.network});

    return {
      script,
      output_script: output.script,
      private_key: privateKey,
      public_key: key.public_key,
    };
  };

  // A Taproot HTLC has a MuSig2 internal key of the client and service keys
  const taprootHtlc = async ({request}) => {
    const key = await getPublicKey({family: args.key_family, lnd: args.lnd});

    const {branches, refund} = swapScriptBranches({
      claim_public_key: bufferAsHex(request.receiver_key),
      hash: bufferAsHex(request.swap_hash),
      refund_public_key: key.public_key,
      timeout: request.expiry,
    });

    const rootHash = hashForTree({branches}).hash;

    // The LND of the service has the MuSig2 internal key
    const session = await beginGroupSigningSession({
      key_family: args.key_family,
      key_index: key.index,
      lnd: args.lnd,
      public_keys: [bufferAsHex(request.receiver_key)],
      root_hash: rootHash,
    });

    await endGroupSigningSession({id: session.id, lnd: args.lnd});

    const internalKey = xOnlyPublicKey({public_key: session.internal_key});

    const output = v1OutputScript({
      hash: rootHash,
      internal_key: internalKey.x_only,
    });

    return {
      branches,
      key,
      refund,
      external_key: output.external_key,
      internal_key: internalKey.x_only,
      output_script: output.script,
      public_key: key.public_key,
      root_hash: rootHash,
    };
  };

  // A P2WSH HTLC is refunded with the private key that the service keeps
  const legacyRefund = async ({address, swap}) => {
    return refundTransaction({
      block_height: swap.timeout,
      fee_tokens_per_vbyte: feeRate,
      network: args.network,
      private_key: swap.htlc.private_key,
      sweep_address: address,
      tokens: swap.published.tokens,
      transaction_id: swap.published.transaction_id,
      transaction_vout: swap.published.transaction_vout,
      witness_script: swap.htlc.script,
    });
  };

  // A Taproot HTLC is refunded on its refund leaf with the LND of the service
  const taprootRefund = async ({address, swap}) => {
    const {htlc, published} = swap;

    const unsigned = taprootRefundTransaction({
      block_height: swap.timeout,
      external_key: htlc.external_key,
      fee_tokens_per_vbyte: feeRate,
      internal_key: htlc.internal_key,
      network: args.network,
      output_script: htlc.output_script,
      refund_script: htlc.refund,
      script_branches: htlc.branches,
      sweep_address: address,
      tokens: published.tokens,
      transaction_id: published.transaction_id,
      transaction_vout: published.transaction_vout,
    });

    const {signatures} = await signTransaction({
      inputs: [{
        key_family: args.key_family,
        key_index: htlc.key.index,
        output_script: htlc.output_script,
        output_tokens: published.tokens,
        sighash: sighashDefault,
        vin: 0,
        witness_script: htlc.refund,
      }],
      lnd: args.lnd,
      transaction: unsigned.transaction,
    });

    // The control block proves the refund leaf is in the HTLC output
    const {block} = controlBlock({
      external_key: htlc.external_key,
      internal_key: htlc.internal_key,
      leaf_script: htlc.refund,
      script_branches: htlc.branches,
    });

    const [signature] = signatures;

    const tx = componentsOfTransaction({transaction: unsigned.transaction});

    const inputs = tx.inputs.map(input => ({
      ...input,
      witness: [signature, htlc.refund, block],
    }));

    return encodeTransaction({...tx, inputs});
  };

  const methods = {
    // Cancel the payments of a swap that the client could not pay
    cancelLoopOutSwap: async ({request}) => {
      requests.cancelLoopOutSwap.push(request);

      const cancel = request.route_cancel || {};
      const id = bufferAsHex(request.swap_hash);
      const payment = bufferAsHex(request.payment_address);

      // Only a client that has the swap invoice can cancel the swap
      if (!swaps[id] || payment !== paymentOf(swaps[id].fund.request)) {
        throw new Error('ExpectedPaymentAddressOfSwapToCancel');
      }

      const isPrepay = cancel.route_type === prepayRoute;

      await cancelPayments({id});

      update({id, state: isPrepay ? prepayCanceled : invoiceCanceled});

      return {};
    },

    // Settle the swap payment with a preimage that the client gives early
    loopOutPushPreimage: async ({request}) => {
      requests.loopOutPushPreimage.push(request);

      const id = sha256(request.preimage);

      if (!swaps[id]) {
        throw new Error('ExpectedPreimageOfKnownSwapToSettle');
      }

      await settle({id, secret: bufferAsHex(request.preimage)});

      return {};
    },

    // Quote the swap fee and the prepay to pay to the service node
    loopOutQuote: ({request}) => {
      requests.loopOutQuote.push(request);

      return {
        cltv_delta: args.cltv_delta,
        prepay_amt: String(args.prepay),
        swap_fee: String(args.fee),
        swap_payment_dest: wallet.public_key,
      };
    },

    // Give the limits of swap tokens and of swap timeouts
    loopOutTerms: ({request}) => {
      requests.loopOutTerms.push(request);

      return {
        max_cltv_delta: args.max_cltv_delta || defaultMaxCltvDelta,
        max_swap_amount: String(args.max_tokens || defaultMaxTokens),
        min_cltv_delta: args.cltv_delta,
        min_swap_amount: String(args.min_tokens || defaultMinTokens),
      };
    },

    // Co-sign a sweep of the HTLC of a swap that the client paid
    muSig2SignSweep: async ({request}) => {
      requests.muSig2SignSweep.push(request);

      const id = bufferAsHex(request.swap_hash);
      const payment = bufferAsHex(request.payment_address);

      const swap = swaps[id];

      if (!swap || payment !== paymentOf(swap.fund.request)) {
        throw new Error('ExpectedPaymentAddressOfSwapToCoSign');
      }

      if (!swap.is_taproot || !swap.published) {
        throw new Error('ExpectedPublishedTaprootSwapToCoSign');
      }

      // The service only gives up its refund once it has the preimage
      if (!swap.is_paid) {
        throw new Error('ExpectedPaidSwapToCoSignSweep');
      }

      const psbt = decodePsbt({psbt: bufferAsHex(request.sweep_tx_psbt)});

      const transaction = psbt.unsigned_transaction;

      const [spent] = componentsOfTransaction({transaction}).inputs;

      // Only a sweep of the HTLC of the swap is co-signed
      if (`${spent.id}:${spent.vout}` !== outpoint(swap.published)) {
        throw new Error('ExpectedSweepOfSwapHtlcToCoSign');
      }

      const spends = psbt.inputs.map(({witness_utxo}) => ({
        script: witness_utxo.script_pub,
        tokens: witness_utxo.tokens,
      }));

      const {hash} = v1HashToSign({
        spends,
        transaction,
        sighash: sighashDefault,
        vin: 0,
      });

      const session = await beginGroupSigningSession({
        key_family: args.key_family,
        key_index: swap.htlc.key.index,
        lnd: args.lnd,
        public_keys: [swap.claim_public_key],
        root_hash: swap.htlc.root_hash,
      });

      const {signature} = await updateGroupSigningSession({
        hash,
        id: session.id,
        lnd: args.lnd,
        nonces: [bufferAsHex(request.nonce)],
      });

      await endGroupSigningSession({id: session.id, lnd: args.lnd});

      return {
        nonce: hexAsBuffer(session.nonce),
        partial_signature: hexAsBuffer(signature),
      };
    },

    // Make a swap with hold invoices to pay and an HTLC that pays the client
    newLoopOutSwap: async ({request}) => {
      requests.newLoopOutSwap.push(request);

      const id = bufferAsHex(request.swap_hash);
      const isTaproot = request.protocol_version === taprootVersion;
      const prepaySecret = randomBytes(32);
      const tokens = Number(request.amt);

      const makeHtlc = isTaproot ? taprootHtlc : legacyHtlc;

      const htlc = await makeHtlc({request});

      // The client pays the swap tokens and the fee, less the prepay
      const fund = await createHodlInvoice({
        id,
        cltv_delta: invoiceCltvDelta,
        lnd: args.lnd,
        tokens: tokens + args.fee - args.prepay,
      });

      // The prepay pays to a hash of the service, it is taken once published
      const prepay = await createHodlInvoice({
        cltv_delta: invoiceCltvDelta,
        id: sha256(prepaySecret),
        lnd: args.lnd,
        tokens: args.prepay,
      });

      swaps[id] = {
        fund,
        htlc,
        prepay,
        tokens,
        claim_public_key: bufferAsHex(request.receiver_key),
        is_taproot: isTaproot,
        prepay_secret: bufferAsHex(prepaySecret),
        states: [],
        subscribers: [],
        timeout: request.expiry,
      };

      update({id, state: 'SERVER_INITIATED'});

      return {
        prepay_invoice: prepay.request,
        sender_key: hexAsBuffer(htlc.public_key),
        swap_invoice: fund.request,
      };
    },

    // Send the status of a swap now and then as it changes
    subscribeLoopOutUpdates: ({call, request}) => {
      requests.subscribeLoopOutUpdates.push(request);

      const swap = swaps[bufferAsHex(request.swap_hash)];

      // Exit early when the swap is not known
      if (!swap) {
        return call.end();
      }

      swap.subscribers.push(call);

      call.on('cancelled', () => {
        return swap.subscribers.splice(swap.subscribers.indexOf(call), 1);
      });

      const [status] = swap.states.slice(-1);

      return call.write(status);
    },
  };

  const server = await grpcSwapServer({methods});

  return {
    requests,
    update,
    cert: server.cert,

    // Fail a swap the service did not publish, so its payments fail back
    fail: async ({id, state}) => {
      await cancelPayments({id});

      return update({id, state});
    },

    // Publish the HTLC of a swap once the payments of the client are held
    publish: async ({id, tokens}) => {
      const swap = swaps[id];

      const [fund, prepay] = await Promise.all([
        getInvoice({id: swap.fund.id, lnd: args.lnd}),
        getInvoice({id: swap.prepay.id, lnd: args.lnd}),
      ]);

      if (!fund.is_held || !prepay.is_held) {
        throw new Error('ExpectedHeldSwapPaymentsToPublishHtlc');
      }

      // An HTLC can pay less than the swap tokens, like a faulty service
      const htlcTokens = tokens || swap.tokens;

      const sent = await sendToChainOutputScripts({
        fee_tokens_per_vbyte: feeRate,
        lnd: args.lnd,
        send_to: [{script: swap.htlc.output_script, tokens: htlcTokens}],
      });

      const htlcTx = componentsOfTransaction({transaction: sent.transaction});

      const isHtlc = n => n.script === swap.htlc.output_script;

      swap.published = {
        tokens: htlcTokens,
        transaction: sent.transaction,
        transaction_id: sent.id,
        transaction_vout: htlcTx.outputs.findIndex(isHtlc),
      };

      // The prepay pays for publishing the HTLC, so it is taken now
      await settleHodlInvoice({lnd: args.lnd, secret: swap.prepay_secret});

      update({id, state: 'SERVER_HTLC_PUBLISHED'});

      return swap.published;
    },

    // Refund an HTLC with its timeout path, the swap payment fails back
    refund: async ({address, id}) => {
      const swap = swaps[id];

      const refundHtlc = swap.is_taproot ? taprootRefund : legacyRefund;

      const {transaction} = await refundHtlc({address, swap});

      await broadcastTransaction({transaction, lnd: args.lnd});

      await cancelPayments({id});

      update({id, state: 'SERVER_TIMEOUT_PUBLISHED'});

      return {transaction};
    },

    // Settle the swap payment with a preimage that the service found
    settle: async ({id, secret}) => await settle({id, secret}),

    // Settle the swap payment with the preimage that a claim makes public
    settleFromClaim: async ({id, transaction}) => {
      const secret = preimageIn({transaction, hash: id});

      if (!secret) {
        throw new Error('ExpectedSwapPreimageInClaimTransaction');
      }

      return await settle({id, secret});
    },

    socket: server.socket,
    stop: server.stop,
  };
};

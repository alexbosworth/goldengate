const {createHash} = require('node:crypto');
const {equal} = require('node:assert').strict;
const {promisify} = require('node:util');
const {randomBytes} = require('node:crypto');
const test = require('node:test');

const asyncRetry = require('async/retry');
const asyncTimeout = require('async/timeout');
const {componentsOfTransaction} = require('@alexbosworth/blockchain');
const {createChainAddress} = require('ln-service');
const {getChainTransactions} = require('ln-service');
const {getHeight} = require('ln-service');
const {getUtxos} = require('ln-service');
const {idForTransaction} = require('@alexbosworth/blockchain');
const {parsePaymentRequest} = require('ln-service');
const {payViaPaymentRequest} = require('ln-service');
const {spawnLoopServerDocker} = require('ln-docker-daemons');

const {attemptTaprootClaim} = require('./../../');
const {createSwapOut} = require('./../../');
const {getSwapOutTerms} = require('./../../');
const {lightningLabsSwapAuth} = require('./../../');
const {lightningLabsSwapService} = require('./../../');
const {makePrivateKey} = require('./../../script');
const {spawnLightningPair} = require('./../macros');
const swapKey = require('./../../script/get_public_key');
const {taprootSwapOutHtlc} = require('./../macros');
const {waitForSameChainTip} = require('./../macros');

const bufferAsHex = buffer => buffer.toString('hex');
const capacity = 5e6;
const feeRate = 2;
const {floor} = Math;
const fundDelayMs = 1000 * 60;
const interval = 50;
const maturity = 100;
const maxFeeMultiplier = 1000;
const network = 'btcregtest';
const paymentsTimeoutMs = 1000 * 60 * 2;
const settled = promise => promise.then(res => ({res}), err => ({err}));
const sha256 = secret => createHash('sha256').update(secret).digest('hex');
const times = 2400;

// The index of the output of a transaction that pays to an output script
const outputIndex = ({script, transaction}) => {
  const {outputs} = componentsOfTransaction({transaction});

  return outputs.findIndex(n => n.script === script);
};

// Find a transaction that pays to an output script
const findPayment = ({script, transactions}) => {
  return transactions.find(({transaction}) => {
    return outputIndex({script, transaction}) !== -1;
  });
};

// A swap out with the regtest Lightning Labs swap service is claimed on-chain
test(`Swap out with the regtest swap service`, async () => {
  const {kill, nodes} = await spawnLightningPair({capacity});

  const [client, server] = nodes;

  const {metadata} = lightningLabsSwapAuth({});

  try {
    // The service funds HTLCs with coins of its LND, which need to mature
    await server.generate({count: maturity});

    await waitForSameChainTip({lnds: [client.lnd, server.lnd]});

    await client.generate({count: maturity});

    await waitForSameChainTip({lnds: [client.lnd, server.lnd]});

    // The service uses the LND of the server node, and follows its chain
    const loopServer = await spawnLoopServerDocker({
      chain_socket: server.docker.chain_socket,
      lnd_cert: server.docker.cert,
      lnd_docker_host: server.docker.docker_host,
      lnd_macaroon: server.docker.macaroon,
    });

    // The swap client connects with TLS, which the TLS socket provides
    const {service} = lightningLabsSwapService({
      network,
      cert: loopServer.cert,
      socket: loopServer.tls_socket,
    });

    try {
      // The service takes requests once it is connected to its LND
      const terms = await asyncRetry({interval, times}, async () => {
        return await getSwapOutTerms({metadata, service});
      });

      const claimKey = makePrivateKey({}).private_key;
      const height = await getHeight({lnd: client.lnd});
      const secret = randomBytes(32);
      const spread = terms.max_cltv_delta - terms.min_cltv_delta;

      // The swap times out halfway between the shortest and longest timeouts
      const delta = terms.min_cltv_delta + floor(spread / 2);

      const claimPublicKey = swapKey({private_key: claimKey}).public_key;
      const hash = sha256(secret);
      const timeout = height.current_block_height + delta;
      const tokens = terms.min_tokens;

      // The service needs the swap payments before the publication deadline
      const fundAt = new Date(Date.now() + fundDelayMs).toISOString();

      const swap = await createSwapOut({
        hash,
        metadata,
        network,
        service,
        timeout,
        tokens,
        fund_at: fundAt,
        public_key: claimPublicKey,
      });

      const {id} = parsePaymentRequest({request: swap.swap_fund_request});

      equal(id, hash, 'The swap payment pays to the swap hash');

      // The service gets the prepay and a swap payment that it holds
      const prepaid = settled(payViaPaymentRequest({
        lnd: client.lnd,
        request: swap.swap_execute_request,
      }));

      const paid = settled(payViaPaymentRequest({
        lnd: client.lnd,
        request: swap.swap_fund_request,
      }));

      const htlc = taprootSwapOutHtlc({
        hash,
        timeout,
        claim_public_key: claimPublicKey,
        service_public_key: swap.service_public_key,
      });

      // Wait for the service to fund the HTLC that the client derives
      const published = await asyncRetry({interval, times}, async () => {
        const {transactions} = await getChainTransactions({lnd: server.lnd});

        const tx = findPayment({transactions, script: htlc.output_script});

        if (!tx) {
          throw new Error('ExpectedServiceToFundSwapHtlc');
        }

        return tx;
      });

      // Wait for the HTLC funding to confirm
      const confirmed = await asyncRetry({interval, times}, async () => {
        await server.generate({});

        const {transactions} = await getChainTransactions({lnd: server.lnd});

        const tx = transactions.find(n => n.id === published.id);

        if (!tx || !tx.is_confirmed) {
          throw new Error('ExpectedHtlcFundingConfirmed');
        }

        return tx;
      });

      // Wait for the client to see the HTLC funding
      const chainTip = await asyncRetry({interval, times}, async () => {
        const tip = await getHeight({lnd: client.lnd});

        if (tip.current_block_height < confirmed.confirmation_height) {
          throw new Error('ExpectedClientToSeeHtlcFunding');
        }

        return tip;
      });

      const vout = outputIndex({
        script: htlc.output_script,
        transaction: confirmed.transaction,
      });

      const {outputs} = componentsOfTransaction({
        transaction: confirmed.transaction,
      });

      equal(outputs[vout].tokens, tokens, 'The HTLC has the swap tokens');

      const {address} = await createChainAddress({lnd: client.lnd});

      // The client claims the HTLC with the preimage
      const claimed = await attemptTaprootClaim({
        network,
        tokens,
        claim_script: htlc.claim,
        current_height: chainTip.current_block_height,
        deadline_height: timeout,
        external_key: htlc.external_key,
        internal_key: htlc.internal_key,
        lnd: client.lnd,
        max_fee_multiplier: maxFeeMultiplier,
        min_fee_rate: feeRate,
        output_script: htlc.output_script,
        private_key: claimKey,
        script_branches: htlc.branches,
        secret: bufferAsHex(secret),
        start_height: chainTip.current_block_height,
        sweep_address: address,
        transaction_id: confirmed.id,
        transaction_vout: vout,
      });

      const claimId = idForTransaction({transaction: claimed.transaction}).id;

      // Wait for the claim to confirm
      await asyncRetry({interval, times}, async () => {
        await client.generate({});

        const {utxos} = await getUtxos({lnd: client.lnd});

        const utxo = utxos.find(n => n.transaction_id === claimId);

        if (!utxo || !utxo.confirmation_count) {
          throw new Error('ExpectedHtlcClaimConfirmed');
        }
      });

      // A swap payment that the service never settles fails, and cleans up
      const waitForPayments = promisify(asyncTimeout(async () => {
        return await Promise.all([prepaid, paid]);
      },
      paymentsTimeoutMs));

      // The service settles the swap payment with the preimage of the claim
      const [prepay, payment] = await waitForPayments();

      equal(prepay.err, undefined, 'The client pays the prepay');
      equal(payment.err, undefined, 'The client pays for the swap');
      equal(payment.res.secret, bufferAsHex(secret), 'The swap is settled');
    } catch (err) {
      equal(err, null, 'Expected no error');
    } finally {
      service.close();

      await loopServer.kill({});
    }
  } finally {
    await kill();
  }

  return;
});

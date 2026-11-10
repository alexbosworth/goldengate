const {createHash} = require('node:crypto');
const {equal} = require('node:assert').strict;
const {randomBytes} = require('node:crypto');
const test = require('node:test');

const asyncRetry = require('async/retry');
const {beginGroupSigningSession} = require('ln-service');
const {componentsOfTransaction} = require('@alexbosworth/blockchain');
const {createChainAddress} = require('ln-service');
const {createHodlInvoice} = require('ln-service');
const {createInvoice} = require('ln-service');
const {endGroupSigningSession} = require('ln-service');
const {getChainTransactions} = require('ln-service');
const {getHeight} = require('ln-service');
const {getPublicKey} = require('ln-service');
const {getUtxos} = require('ln-service');
const {hashForTree} = require('p2tr');
const {idForTransaction} = require('@alexbosworth/blockchain');
const {parsePaymentRequest} = require('ln-service');
const {sendToChainOutputScripts} = require('ln-service');
const {spawnLightningCluster} = require('ln-docker-daemons');
const {v1OutputScript} = require('p2tr');

const {attemptTaprootClaim} = require('./../../');
const {createSwapOut} = require('./../../');
const {grpcSwapServer} = require('./../macros');
const {lightningLabsSwapAuth} = require('./../../');
const {lightningLabsSwapService} = require('./../../');
const {makePrivateKey} = require('./../../script');
const musig2KeyAggregate = require('./../../script/musig2_key_aggregate');
const musig2KeySort = require('./../../script/musig2_key_sort');
const swapKey = require('./../../script/get_public_key');
const {swapScriptBranches} = require('./../../');
const xOnlyPublicKey = require('./../../taproot/x_only_public_key');

const bufferAsHex = buffer => buffer.toString('hex');
const cltvDelta = 100;
const family = 805;
const feeRate = 2;
const fundWindowMs = 1000 * 60 * 30;
const hexAsBuffer = hex => Buffer.from(hex, 'hex');
const interval = 10;
const macaroon = Buffer.from('macaroon').toString('base64');
const maturity = 100;
const maxFeeMultiplier = 1000;
const msPerSec = 1e3;
const musig2Version = 'MUSIG2';
const network = 'btcregtest';
const preimage = Buffer.alloc(32).toString('hex');
const prepayTokens = 30000;
const {round} = Math;
const sha256 = secret => createHash('sha256').update(secret).digest('hex');
const size = 2;
const times = 2000;
const tokens = 1e6;

// A Taproot swap out has a MuSig2 HTLC the client claims with the preimage
test(`Create Taproot swap out`, async () => {
  const {kill, nodes} = await spawnLightningCluster({size});

  const [client, server] = nodes;

  const swaps = [];

  // The service makes the swap invoices and has a key for the swap HTLC
  const swapServer = await grpcSwapServer({
    methods: {
      newLoopOutSwap: async ({request}) => {
        const key = await getPublicKey({family, lnd: server.lnd});

        // The swap is paid with a hold invoice for the hash of the preimage
        const fund = await createHodlInvoice({
          id: bufferAsHex(request.swap_hash),
          lnd: server.lnd,
          tokens: Number(request.amt),
        });

        const prepay = await createInvoice({
          lnd: server.lnd,
          tokens: prepayTokens,
        });

        swaps.push({fund, key, prepay, request});

        return {
          prepay_invoice: prepay.request,
          sender_key: hexAsBuffer(key.public_key),
          swap_invoice: fund.request,
        };
      },
    },
  });

  const {metadata} = lightningLabsSwapAuth({macaroon, preimage});

  const {service} = lightningLabsSwapService({
    network,
    cert: swapServer.cert,
    socket: swapServer.socket,
  });

  try {
    await server.generate({count: maturity});

    const claimKey = makePrivateKey({}).private_key;
    const fundAt = new Date(Date.now() + fundWindowMs).toISOString();
    const height = await getHeight({lnd: client.lnd});
    const secret = randomBytes(32);

    const claimPublicKey = swapKey({private_key: claimKey}).public_key;
    const deadline = round(new Date(fundAt).getTime() / msPerSec);
    const hash = sha256(secret);
    const timeout = height.current_block_height + cltvDelta;

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

    const [created] = swaps;

    // The service gets the details of the swap
    equal(created.request.amt, String(tokens), 'Service gets swap tokens');
    equal(created.request.expiry, timeout, 'Service gets the swap timeout');
    equal(created.request.protocol_version, musig2Version, 'Swap is MuSig2');
    equal(bufferAsHex(created.request.receiver_key), claimPublicKey, 'Key');
    equal(bufferAsHex(created.request.swap_hash), hash, 'Gets the swap hash');

    equal(
      created.request.swap_publication_deadline,
      String(deadline),
      'Service gets the deadline to fund the swap'
    );

    // The client gets the service key and the swap invoices
    const {id} = parsePaymentRequest({request: swap.swap_fund_request});

    equal(id, hash, 'Swap funding request pays to the swap hash');
    equal(swap.service_public_key, created.key.public_key, 'Got service key');
    equal(swap.swap_execute_request, created.prepay.request, 'Got prepay');
    equal(swap.swap_fund_request, created.fund.request, 'Got swap request');

    // The client makes the HTLC with the service key
    const {branches, claim} = swapScriptBranches({
      hash,
      timeout,
      claim_public_key: claimPublicKey,
      refund_public_key: swap.service_public_key,
    });

    const rootHash = hashForTree({branches}).hash;

    // The internal key aggregates the client and service keys with MuSig2
    const {sorted} = musig2KeySort({
      public_keys: [claimPublicKey, swap.service_public_key],
    });

    const internalKey = xOnlyPublicKey({
      public_key: musig2KeyAggregate({public_keys: sorted}).public_key,
    });

    const output = v1OutputScript({
      hash: rootHash,
      internal_key: internalKey.x_only,
    });

    // The service makes the HTLC with the MuSig2 key of its LND
    const session = await beginGroupSigningSession({
      key_family: family,
      key_index: created.key.index,
      lnd: server.lnd,
      public_keys: [claimPublicKey],
      root_hash: rootHash,
    });

    await endGroupSigningSession({id: session.id, lnd: server.lnd});

    const htlc = v1OutputScript({
      hash: rootHash,
      internal_key: session.internal_key,
    });

    equal(htlc.script, output.script, 'Client and service have the same HTLC');

    // The service funds the HTLC
    const funding = await sendToChainOutputScripts({
      fee_tokens_per_vbyte: feeRate,
      lnd: server.lnd,
      send_to: [{tokens, script: htlc.script}],
    });

    // Wait for the HTLC funding to confirm
    const confirmed = await asyncRetry({interval, times}, async () => {
      await server.generate({});

      const {transactions} = await getChainTransactions({lnd: server.lnd});

      const tx = transactions.find(n => n.id === funding.id);

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

    const {outputs} = componentsOfTransaction({
      transaction: funding.transaction,
    });

    // The client claims the HTLC with the preimage
    const claimed = await attemptTaprootClaim({
      network,
      tokens,
      claim_script: claim,
      current_height: chainTip.current_block_height,
      deadline_height: timeout,
      external_key: output.external_key,
      internal_key: internalKey.x_only,
      lnd: client.lnd,
      max_fee_multiplier: maxFeeMultiplier,
      min_fee_rate: feeRate,
      output_script: output.script,
      private_key: claimKey,
      script_branches: branches,
      secret: bufferAsHex(secret),
      start_height: chainTip.current_block_height,
      sweep_address: (await createChainAddress({lnd: client.lnd})).address,
      transaction_id: funding.id,
      transaction_vout: outputs.findIndex(n => n.script === output.script),
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

    // The claim gives the service the preimage to settle the swap payment
    const [{witness}] = componentsOfTransaction({
      transaction: claimed.transaction,
    }).inputs;

    equal(witness.includes(bufferAsHex(secret)), true, 'Preimage is public');
  } catch (err) {
    equal(err, null, 'Expected no error');
  } finally {
    service.close();

    swapServer.stop();

    await kill({});
  }

  return;
});

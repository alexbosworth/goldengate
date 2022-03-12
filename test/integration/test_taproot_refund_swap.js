const {createHash} = require('crypto');
const {randomBytes} = require('crypto');

const asyncRetry = require('async/retry');
const {broadcastChainTransaction} = require('ln-service');
const {createChainAddress} = require('ln-service');
const {createPsbt} = require('psbt');
const {fundPsbt} = require('ln-service');
const {getChainFeeRate} = require('ln-service');
const {getHeight} = require('ln-service');
const {getUtxos} = require('ln-service');
const {hashForTree} = require('p2tr');
const {networks} = require('bitcoinjs-lib');
const {signPsbt} = require('ln-service');
const {spawnLightningCluster} = require('ln-docker-daemons');
const {test} = require('@alexbosworth/tap');
const tinysecp = require('tiny-secp256k1');
const {Transaction} = require('bitcoinjs-lib');
const {v1OutputScript} = require('p2tr');

const {swapScriptBranches} = require('./../../');
const {taprootRefundTransaction} = require('./../../');

const cltvDelta = 20;
const defaultInternalKey = '0350929b74c1a04954b78b4b6035e97a5e078a5a0f28ec96d547bfee9ace803ac0';
const {fromHex} = Transaction;
const interval = 10;
const makeSecret = () => randomBytes(32);
const maturity = 100;
const networkName = 'btcregtest';
const sha256 = preimage => createHash('sha256').update(preimage).digest('hex');
const size = 2;
const times = 2000;
const timeoutHeight = 300;
const tokens = 1e6;

// Swapping in taproot with a timeout should result in a successful refund
test(`Taproot Refund Swap`, async ({end, equal}) => {
  const ecp = (await import('ecpair')).ECPairFactory(tinysecp);
  const {kill, nodes} = await spawnLightningCluster({size});

  const [{generate, lnd}, target] = nodes;
  const secret = makeSecret();

  try {
    const claimKey = ecp.makeRandom({network: networks.regtest});
    const refundKey = ecp.makeRandom({network: networks.regtest});
    const currentHeight = (await getHeight({lnd})).current_block_height;

    const swapScript = swapScriptBranches({
      ecp,
      claim_public_key: claimKey.publicKey.toString('hex'),
      hash: sha256(secret),
      refund_private_key: refundKey.privateKey.toString('hex'),
      timeout: timeoutHeight,
    });

    const output = v1OutputScript({
      hash: hashForTree({branches: swapScript.branches}).hash,
      internal_key: defaultInternalKey,
    });

    await generate({count: maturity});

    const [utxo] = (await getUtxos({lnd})).utxos.reverse();

    // Make a PSBT paying to the Taproot output
    const {psbt} = createPsbt({
      outputs: [{tokens, script: output.script}],
      utxos: [{id: utxo.transaction_id, vout: utxo.transaction_vout}],
    });

    // Sign the PSBT
    const signed = await signPsbt({
      lnd,
      psbt: (await fundPsbt({lnd, psbt})).psbt,
    });

    // Send the tx to the chain
    await broadcastChainTransaction({lnd, transaction: signed.transaction});

    const {outs} = fromHex(signed.transaction);

    const {transaction} = taprootRefundTransaction({
      ecp,
      tokens,
      block_height: (await getHeight({lnd})).current_block_height + 400,
      external_key: output.external_key,
      fee_tokens_per_vbyte: (await getChainFeeRate({lnd})).tokens_per_vbyte,
      network: networkName,
      output_script: output.script,
      private_key: refundKey.privateKey.toString('hex'),
      refund_script: swapScript.refund,
      script_branches: swapScript.branches,
      sweep_address: (await createChainAddress({lnd})).address,
      transaction_id: fromHex(signed.transaction).getId(),
      transaction_vout: outs.findIndex(n => n.value === tokens),
    });

    const tx = fromHex(transaction);

    await generate({count: 500});

    await broadcastChainTransaction({lnd, transaction: tx.toHex()});

    await asyncRetry({interval, times}, async () => {
      await generate({});

      const {utxos} = await getUtxos({lnd});

      const utxo = utxos.find(n => n.transaction_id === tx.getId());

      if (!utxo || !utxo.confirmation_count) {
        throw new Error('ExpectedReceivedTaprootSpend');
      }
    });
  } catch (err) {
    equal(err, null, 'Expected no error');
  }

  await kill({});

  return end();
});

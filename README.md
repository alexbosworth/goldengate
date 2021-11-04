# GoldenGate

Utility functions for working with HTLC-based transfers.

[![npm version](https://badge.fury.io/js/goldengate.svg)](https://badge.fury.io/js/goldengate)
[![Coverage Status](https://coveralls.io/repos/github/alexbosworth/goldengate/badge.svg?branch=master)](https://coveralls.io/github/alexbosworth/goldengate?branch=master)
[![Build Status](https://travis-ci.org/alexbosworth/goldengate.svg?branch=master)](https://travis-ci.org/alexbosworth/goldengate)

## Networks

Supported networks:

- `btc`: Bitcoin mainnet
- `btctestnet`: Bitcoin testnet3

## Swap Execution

An HTLC swap is carried out in two phases.

In the first phase, the swap partners setup the details of the swap. Once the
first phase is set, the funding party funds an HTLC with those details
on-chain.

In the second phase either party sweeps the funds using either the successful
claim path or the unsuccessful refund path.

### Phase 1: Setup

In this phase, the following elements must be synchronized between the swappers:

- A claim public key
- A refund public key
- A timeout block height
- A claim hash
- A number of tokens

Aside from tokens, these values are the inputs to the `swapScript` or
`swapScriptV2` method that produces the witness script.

This script may be converted into an address with `addressForScript`, and phase
1 completes when the funder spends to this address with the given tokens.

### Phase 2: Resolution

In this phase each party must derive an address to sweep the funds out to, and
they must determine the UTXO or UTXOs that they will sweep.

The funder knows the UTXO details because they crafted the output, but either
party can use `findDeposit` to find a UTXO given the swap address.

Now either party can attempt to claim the funds out to their address, through
either `claimTransaction` or `refundTransaction`.

These transactions will also require a fee rate, which can be derived from a
backing estimator using `getChainFeeRate` or it can be derived using blind RBF
with `confirmationFee`

And they will require a chain height, which can be retrieved using `getHeight`.

Once a transaction is formed, it can be broadcast with `broadcastTransaction`.

## Methods

### askForFeeRate

Ask to get a chain fee rate

    {
      ask: <Inquirer Ask Function>
      lnd: <Authenticated LND API Object>
    }

    @returns via cbk or Promise
    {
      tokens_per_vbyte: <Chain Fee Tokens Per VByte Number>
    }

### attemptRefund

Attempt a refund

    {
      [fee_tokens_per_vbyte]: <Fee Tokens Per Virtual Byte Number>
      hash: <Swap Hash Hex String>
      [lnd]: <Authenticated LND API gRPC Object>
      [network]: <Network Name String>
      refund_private_key: <Refund Private Key Hex String>
      [request]: <Request Function>
      service_public_key: <Service Public Key Hex String>
      start_height: <Swap Start Height Number>
      sweep_address: <Sweep Address String>
      timeout_height: <Timeout Block Height Number>
      tokens: <Swap Tokens Number>
      [version]: <Swap Version Number>
    }

    @returns via cbk or Promise
    {
      refund_transaction: <Transaction Hex String>
      transaction_id: <Transaction Id Hex String>
      transaction_vout: <Transaction Vout Number>
    }

### attemptSweep

Attempt a sweep

    {
      current_height: <Current Chain Height Number>
      deadline_height: <Ultimate Target Chain Height Number>
      [is_dry_run]: <Avoid Broadcasting Transaction Bool>
      [lnd]: <Authenticated gRPC LND API Object>
      [min_fee_rate]: <Minimum Relay Fee Tokens Per VByte Number>
      max_fee_multiplier: <Maximum Fee Multiplier Number>
      network: <Network Name String>
      private_key: <Sweep Claim Key Private Key Hex String>
      [request]: <Request Function>
      secret: <Secret Preimage Hex String>
      [sends]: [{
        address: <Send to Address String>
        tokens: <Send Tokens Number>
      }]
      start_height: <Starting Height of Attempts Number>
      sweep_address: <Bech32 Sweep Address String>
      tokens: <Sweep Tokens Number>
      transaction_id: <Deposit Transaction Id String>
      transaction_vout: <Deposit Transaction Vout Number>
      witness_script: <Swap Redeem Script Hex String>
    }

    @returns via cbk or Promise
    {
      fee_rate: <Fee Rate Number>
      min_fee_rate: <Minimum Tokens Per VByte Fee Rate Number>
      transaction: <Raw Transaction Hex String>
    }

### cancelSwapOut

Cancel a swap out

    {
      id: <Funding Request Payment Hash Hex String>
      metadata: <Authentication Metadata Object>
      payment: <Funding Request Payment Identifier Hex String>
      service: <Swap Service Object>
    }

    @returns via cbk or Promise

```node
const {cancelSwapOut} = require('goldengate');
const {parsePaymentRequest} = require('ln-service');

// use createSwapOut to get fund request
const {id, payment} = parsePaymentRequest({request: swap.swap_fund_request});

// Get metadata from lightningLabsSwapAuth
await cancelSwapOut({id, metadata, payment, service});
```

### createSwapIn

Create a swap in

    {
      fee: <Fee Tokens Number>
      [in_through]: <Request Payment In Through Peer With Public Key Hex String>
      [macaroon]: <Base64 Encoded Macaroon String>
      max_timeout_height: <Max Timeout Height Number>
      [preimage]: <Authentication Preimage Hex String>
      [private_key]: <Refund Private Key Hex String>
      [public_key]: <Refund Public Key Hex String>
      request: <BOLT 11 Payment Request String>
      service: <gRPC Swap Service API Object>
    }

    @returns via cbk or Promise
    {
      address: <Swap Chain Address String>
      id: <Swap Preimage Hash Hex String>
      nested_address: <Swap P2SH Wrapped P2WSH Chain Address String>
      [private_key]: <Private Key Hex String>
      script: <Witness Script Hex String>
      [service_message]: <Service Message String>
      service_public_key: <Service Public Key Hex String>
      timeout: <Swap Timeout Chain Height Number>
      tokens: <Tokens To Pay to Address Number>
      version: <Swap Script Version Number>
    }

Example:

```node
const {createSwapIn, getSwapInQuote} = require('goldengate');
const {lightningLabsSwapService} = require('goldengate');

const tokens = 1000000;
const {fee} = await getSwapInQuote({service, tokens});

const currentBlockHeight = 1500000;
const request = 'bolt11RequestForTokensMinusFee';
const {service} = lightningLabsSwapService({network: 'btctestnet'});

const {address} = await createSwapIn({
  fee,
  request,
  service,
  max_timeout_height: currentBlockHeight + 1000,
});
// address is the swap on-chain address to send to for the swap
```

### createSwapOut

Create a swap out request

Get the `timeout` value by getting swap out terms to determine a CLTV delta

    {
      [fund_at]: <Request Funding On-Chain Before ISO 8601 Date String>
      [hash]: <Swap Hash String>
      [macaroon]: <Base64 Encoded Macaroon String>
      network: <Network Name String>
      [preimage]: <Authentication Preimage Hex String>
      [private_key]: <Private Key Hex String>
      [public_key]: <Public Key Hex String>
      [secret]: <Secret Hex String>
      service: <gRPC Swap Service Object>
      timeout: <Requested Timeout Height Number>
      tokens: <Swap Tokens Number>
    }

    @returns via cbk or Promise
    {
      address: <Swap Chain Address String>
      [private_key]: <Claim Private Key Hex String>
      script: <Redeem Script Hex String>
      [secret]: <Swap Preimage Hex String>
      [service_message]: <Service Message String>
      service_public_key: <Service Public Key Hex String>
      swap_execute_request: <Execute Swap Payment Request String>
      swap_fund_request: <Swap Funding Payment Request String>
      timeout: <Swap Timeout Chain Height Number>
      version: <Swap Version Number>
    }

```node
const {createSwapOut, lightningLabsSwapService} = require('goldengate');

const swap = await createSwapOut({
  network: 'btctestnet',
  service: lightningLabsSwapService({network: 'btctestnet'}).service,
  tokens: 1000000,
});

// swap.address: Address to watch to sweep incoming funds
// swap.private_key: Private key to use to sweep incoming funds
// swap.secret: Preimage to use to sweep incoming funds
// swap.swap_execute_request: Payment request for pre-paying
// swap.swap_fund_request: Payment request for funding the swap
// swap.timeout: Server refund timeout height
// swap.version: HTLC script version number
```

### decodeSwapRecovery

Decode encoded swap recovery blob

    {
      recovery: <Raw Recovery Hex String>
    }

    @returns via cbk or Promise
    {
      [claim_private_key]: <Claim Private Key Hex String>
      [claim_public_key]: <Claim Public Key Hex String>
      [execution_id]: <Swap Execution Id Hex String>
      [id]: <Swap Funding Payment Id Hex String>
      [refund_private_key]: <Refund Private Key Hex String>
      [refund_public_key]: <Refund Public Key Hex String>
      script: <Swap Script Hex String>
      [secret]: <Preimage Secret Hex String>
      start_height: <Start Height Number>
      [sweep_address]: <Sweep Address String>
      timeout: <Swap Timeout Height Number>
      tokens: <Swap Tokens Number>
      [version]: <Swap Script Version Number>
    }

```node
const {decodeSwapRecovery} = require('goldengate');

// Recovery blob is a hex encoded blob with swap refund details

const recoveryDetails = await decodeSwapRecovery({recovery});
// Details to use to attempt a refund from a swap
```

### encodeSwapRecovery

Encode recovery blob

Note: Make sure to encode the version given by swap creation

Either a private key or public key is required for claim/refund

Either the secret preimage or the preimage hash is required for claim/refund 

    {
      [claim_private_key]: <Claim Private Key Hex String>
      [claim_public_key]: <Claim Public Key Hex String>
      [execution_id]: <Swap Execution Id Hex String>
      [id]: <Preimage Hash Hex String>
      [refund_private_key]: <Refund Private Key Hex String>
      [refund_public_key]: <Refund Public Key Hex String>
      [secret]: <Preimage Secret Hex String>
      start_height: <Start Height Number>
      [sweep_address]: <Sweep Address String>
      timeout: <Swap Timeout Height Number>
      tokens: <Swap Tokens Number>
      [version]: <Recovery Blob Version Number>
    }

    @throws
    <Error>

    @returns
    {
      recovery: <Recovery CBOR Blob Hex String>
    }

```node
const {encodeSwapRecovery} = require('goldengate');

const {recovery} = encodeSwapRecovery({
  claim_public_key: serverSwapPublicKey,
  execution_id: executionPaymentRequestPreimageHash,
  id: fundingPaymentRequestPreimageHash,
  refund_private_key: refundPrivateKey,
  start_height: swapStartedAtBlockHeightNumber,
  sweep_address: sendRefundFundsToChainAddress,
  timeout: swapTimeoutNumber,
  tokens: swapTokensAmount,
  version: swapVersionNumber,
});
// Recovery is a blob with the inputs required for a refund attempt
```

### genericSwapService

Generic swap service

For fetch, pass a function like `@alexbosworth/node-fetch` that returns a URL

    {
      fetch: <Fetch Function>
      socket: <Custom Socket String>
    }

    @throws
    <Error>

    @returns
    {
      service: <Swap Service API Object>
    }

### getFundedTransaction

Get a funded transaction

    {
      ask: <Inquirer Ask Function>
      [chain_fee_tokens_per_vbyte]: <Internal Funding Uses Tokens/Vbyte Number>
      [is_external]: <Transaction Uses External Funds Bool>
      lnd: Authenticated LND API Object>
      logger: <Winston Logger Object>
      outputs: [{
        address: <Chain Address String>
        tokens: <Tokens To Send To Output Number>
      }]
    }

    @returns via cbk or Promise
    {
      id: <Transaction Id Hex String>
      [inputs]: [{
        [lock_expires_at]: <UTXO Lock Expires At ISO 8601 Date String>
        [lock_id]: <UTXO Lock Id Hex String>
        transaction_id: <Transaction Hex Id String>
        transaction_vout: <Transaction Output Index Number>
      }]
      [psbt]: <Transaction As Finalized PSBT Hex String>
      [transaction]: <Raw Transaction Hex String>
    }

### getPsbtFromTransaction

Get a PSBT from a raw transaction

    {
      network: <Network Name String>
      request: <Request Function>
      transaction: <Raw Transaction Hex String>
    }

    @returns via cbk or Promise
    {
      psbt: <Finalized PSBT Hex String>
    }

### getSwapInQuote

Get swap in quote from swap service

    {
      service: <Swap Service Object>
      tokens: <Tokens to Swap Number>
    }

    @returns via cbk or Promise
    {
      cltv_delta: <CLTV Delta Number>
      fee: <Total Fee Tokens Number>
    }

```node
const {getSwapInQuote, lightningLabsSwapService} = require('goldengate');

const {fee} = await getSwapInQuote({
  service: lightningLabsSwapService({network: 'btctestnet'}).service,
  tokens: 1000000,
});
// Fee required to complete a swap in
```

### getSwapInTerms

Get swap terms from swap service

    {
      [macaroon]: <Base64 Encoded Macaroon String>
      [preimage]: <Authentication Preimage Hex String>
      service: <Swap Service Object>
    }

    @returns via cbk or Promise
    {
      max_tokens: <Maximum Swap Tokens Number>
      min_tokens: <Minimum Swap Tokens Number>
    }

```node
const {getSwapInTerms, lightningLabsSwapService} = require('goldengate');

const {service} = lightningLabsSwapService({network: 'btctestnet'});

const maxTokens = (await getSwapInTerms({service})).max_tokens;
```

### getSwapMacaroon

Get an unpaid swap macaroon that can be converted to a paid one by paying

    {
      service: <Unauthenticated Swap Service Object>
    }

    @returns via cbk or Promise
    {
      macaroon: <Base64 Encoded Unpaid Macaroon String>
      request: <Payment Request To Activate Macaroon BOLT 11 String>
    }

```node
const {getSwapMacaroon} = require('goldengate');
const {lightningLabsSwapService} = require('goldengate');

const {service} = lightningLabsSwapService({network: 'btctestnet'});

const {macaroon, request} = await getSwapMacaroon({service});
```

### getSwapOutQuote

Get swap quote from swap service

Obtain CLTV delta for `timeout` by getting swap terms

    {
      [delay]: <Delay Swap Funding Until ISO 8601 Date String>
      [macaroon]: <Base64 Encoded Macaroon String>
      [preimage]: <Authentication Preimage Hex String>
      service: <Swap Service Object>
      timeout: <Timeout Height Number>
      tokens: <Tokens Number>
    }

    @returns via cbk or Promise
    {
      cltv_delta: <CLTV Delta Number>
      deposit: <Deposit Tokens Number>
      destination: <Destination Public Key Hex String>
      fee: <Total Fee Tokens Number>
    }

```node
const {getSwapOutQuote, lightningLabsSwapService} = require('goldengate');

const {service} = lightningLabsSwapService({network: 'btctestnet'});

const {fee} = await getSwapOutQuote({service, tokens: 1000000});
// Fee is the service fee to perform a swap out
```

### getSwapOutTerms

Get swap terms from swap service

    {
      [macaroon]: <Base64 Encoded Macaroon String>
      [preimage]: <Authentication Preimage Hex String>
      service: <Swap Service Object>
    }

    @returns via cbk or Promise
    {
      max_cltv_delta: <Maximum Permissible CLTV Delta Number>
      max_tokens: <Maximum Swap Tokens Number>
      min_cltv_delta: <Minimum Permissible CLTV Delta Number>
      min_tokens: <Minimum Swap Tokens Number>
    }

```node
const {getSwapOutTerms, lightningLabsSwapService} = require('goldengate');

const {service} = lightningLabsSwapService({network: 'btc'});

const swapOutLimit = (await getSwapOutTerms({service})).max_tokens;
```

### isSweep

Determine if a transaction is an HTLC sweep

    {
      transaction: <Raw Transaction Hex String>
    }

    @throws
    <Error>

    @returns
    {
      [is_success_sweep]: <Transaction is HTLC Success Sweep Bool>
      [is_timeout_sweep]: <Transaction is HTLC Timeout Sweep Bool>
    }

Example:

```node
const {isSweep} = require('goldengate');

// Transaction is a hex encoded raw transaction
const isTimeoutSweep = isSweep({transaction}).is_timeout_sweep;
```

### lightningLabsSwapService

Lightning Labs swap service

    {
      [is_free]: <Use Free Service Endpoint Bool>
      network: <Network Name String>
      [socket]: <Custom Socket String>
    }

    @throws
    <Error>

    @returns
    {
      service: <Swap Service gRPC API Object>
    }

Example:

```node
const {lightningLabsSwapService} = require('goldengate');

const {service} = lightningLabsSwapService({network: 'btctestnet'});

const {fee} = await getSwapOutQuote({service, tokens: 1000000});
```

### maintainUtxoLocks

Keep input locks alive while related transaction is not yet confirmed

    {
      id: <Transaction Id Hex String>
      inputs: [{
        [lock_expires_at]: <UTXO Lock Expires At ISO 8601 Date String>
        transaction_id: <Unspent Transaction Id Hex String>
        transaction_vout: <Unspent Transaction Output Index Number>
      }]
      interval: <Relock Interval Milliseconds>
      lnd: <Authenticated LND API Object>
    }

    @returns via cbk or Promise

### releaseSwapOutSecret

Release the swap secret to the swap server to obtain inbound more quickly

    {
      secret: <Secret Preimage Hex String>
      service: <Swap Service Object>
    }

    @returns via cbk or Promise

Example:

```node
const {lightningLabsSwapService, releaseSwapOutSecret} = require('goldengate');

const secret = '0000000000000000000000000000000000000000000000000000000000000000';
const {service} = lightningLabsSwapService({network: 'btctestnet'});

// Tell the server about the preimage to complete the off-chain part of the swap
await releaseSwapOutSecret({secret, service});
```

### subscribeToSwapInStatus

Subscribe to the server status of a swap in

    {
      id: <Swap Funding Hash Hex String>
      macaroon: <Base64 Encoded Macaroon String>
      preimage: <Authentication Preimage Hex String>
      service: <Swap Service Object>
    }

    @throws
    <Error Object>

    @returns
    <EventEmitter Object>

    @event 'status_update'
    {
      at: <Last Updated At ISO 8601 Date String>
      [is_broadcast]: <HTLC Published To Mempool Bool>
      [is_claimed]: <HTLC Claimed With Preimage Bool>
      [is_confirmed]: <HTLC Confirmed In Blockchain Bool>
      [is_failed]: <Swap Failed Bool>
      [is_known]: <Swap Is Recognized By Server Bool>
      [is_refunded]: <Swap Is Refunded With Timeout On Chain Bool>
    }

### subscribeToSwapOutStatus

Subscribe to the server status of a swap out

    {
      id: <Swap Funding Hash Hex String>
      macaroon: <Base64 Encoded Macaroon String>
      preimage: <Authentication Preimage Hex String>
      service: <Swap Service Object>
    }

    @throws
    <Error Object>

    @returns
    <EventEmitter Object>

    @event 'status_update'
    {
      at: <Last Updated At ISO 8601 Date String>
      [is_broadcast]: <HTLC Published To Mempool Bool>
      [is_claimed]: <HTLC Claimed With Preimage Bool>
      [is_confirmed]: <HTLC Confirmed In Blockchain Bool>
      [is_failed]: <Swap Failed Bool>
      [is_known]: <Swap Is Recognized By Server Bool>
      [is_refunded]: <Swap Is Refunded With Timeout On Chain Bool>
    }

### swapScript

Get swap redeem script / witness program

A hash or secret is required

A private key or public key is required

    {
      [claim_private_key]: <Claim Private Key Hex String>
      [claim_public_key]: <Claim Public Key Hex String>
      [hash]: <Preimage Hash Hex String>
      [refund_private_key]: <Refund Private Key Hex String>
      [refund_public_key]: <Refund Public Key Hex String>
      [secret]: <Preimage Hex String>
      timeout: <CLTV Timeout Height Number>
    }

    @throws
    <Error> on a script generation error

    @returns
    {
      script: <Hex Serialized Witness Script String>
    }

### swapUserId

Derive the swap user id from the swap macaroon

    {
      macaroon: <Base64 Encoded Macaroon String>
    }

    @throws
    <Error>

    @returns
    {
      id: <Swap User Id Hex String>
    }

Example:

```node
const {swapUserId} = require('goldengate');

// Derive the user id from the swap macaroon
const {id} = swapUserId({macaroon: 'base64Macaroon'});
```

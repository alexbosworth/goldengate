# GoldenGate

Utility functions for working with HTLC-based transfers.

[![npm version](https://badge.fury.io/js/goldengate.svg)](https://badge.fury.io/js/goldengate)
[![Coverage Status](https://coveralls.io/repos/github/alexbosworth/goldengate/badge.svg?branch=master)](https://coveralls.io/github/alexbosworth/goldengate?branch=master)
[![Build Status](https://travis-ci.org/alexbosworth/goldengate.svg?branch=master)](https://travis-ci.org/alexbosworth/goldengate)

## Networks

Supported networks:

- `btc`: Bitcoin mainnet
- `btctestnet`: Bitcoin testnet3

## Methods

### createSwapIn

Create a swap in

    {
      fee: <Fee Tokens Number>
      max_timeout_height: <Max Timeout Height Number>
      [private_key]: <Refund Private Key Hex String>
      [public_key]: <Refund Public Key Hex String>
      request: <BOLT 11 Payment Request String>
      service: <gRPC Swap Service API Object>
    }

    @returns via cbk or Promise
    {
      address: <Swap Chain Address String>
      id: <Swap Preimage Hash Hex String>
      [private_key]: <Private Key Hex String>
      script: <Witness Script Hex String>
      service_public_key: <Service Public Key Hex String>
      timeout: <Swap Timeout Chain Height Number>
      tokens: <Tokens To Pay to Address Number>
    }

Example:

```node
const {createSwapIn, getSwapInQuote, lightningSwapService} = require('goldengate');
const request = require('request');

const currentBlockHeight = 1500000;
const {service} = lightningSwapService({network: 'btctestnet'});
const tokens = 1000000;

const {address} = await createSwapIn({
  request,
  service,
  fee: (await getSwapInQuote({service, tokens})).fee,
  max_timeout_height: currentBlockHeight + 1000,
});
// address is the swap on-chain address to send to for the swap
```

### createSwapOut

Create a swap out request

    {
      [fund_at]: <Request Funding On-Chain Before ISO 8601 Date String>
      [hash]: <Swap Hash String>
      network: <Network Name String>
      [private_key]: <Private Key Hex String>
      [public_key]: <Public Key Hex String>
      [secret]: <Secret Hex String>
      service: <gRPC Swap Service Object>
      tokens: <Swap Tokens Number>
    }

    @returns via cbk or Promise
    {
      address: <Swap Chain Address String>
      [private_key]: <Claim Private Key Hex String>
      script: <Redeem Script Hex String>
      [secret]: <Swap Preimage Hex String>
      service_public_key: <Service Public Key Hex String>
      swap_execute_request: <Execute Swap Payment Request String>
      swap_fund_request: <Swap Funding Payment Request String>
      timeout: <Swap Timeout Chain Height Number>
    }

```node
const {createSwapOut, lightningSwapService} = require('goldengate');

const swap = await createSwapOut({
  network: 'btctestnet',
  service: lightningSwapService({network: 'btctestnet'}).service,
  tokens: 1000000,
});

// swap.address: Address to watch to sweep incoming funds
// swap.private_key: Private key to use to sweep incoming funds
// swap.secret: Preimage to use to sweep incoming funds
// swap.swap_execute_request: Payment request for pre-paying
// swap.swap_fund_request: Payment request for funding the swap
// swap.timeout: Server refund timeout height
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
    }

```node
const {decodeSwapRecovery} = require('goldengate');

// Recovery blob is a hex encoded blob with swap refund details

const recoveryDetails = await decodeSwapRecovery({recovery});
// Details to use to attempt a refund from a swap
```

### encodeSwapRecovery

Encode recovery blob

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
});
// Recovery is a blob with the inputs required for a refund attempt
```

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
const {getSwapInQuote, lightningSwapService} = require('goldengate');

const {fee} = await getSwapInQuote({
  service: lightningSwapService({network: 'btctestnet'}).service,
  tokens: 1000000,
});
// Fee required to complete a swap in
```

### getSwapInTerms

Get swap terms from swap service

    {
      service: <Swap Service Object>
    }

    @returns via cbk or Promise
    {
      max_tokens: <Maximum Swap Tokens Number>
      min_tokens: <Minimum Swap Tokens Number>
    }

```node
const {getSwapInTerms, lightningSwapService} = require('goldengate');

const {service} = lightningSwapService({network: 'btctestnet'});

const maxTokens = (await getSwapInTerms({service})).max_tokens;
```

### getSwapOutQuote

Get swap quote from swap service

    {
      [delay]: <Delay Swap Funding Until ISO 8601 Date String>
      service: <Swap Service Object>
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
const {getSwapOutQuote, lightningSwapService} = require('goldengate');

const {service} = lightningSwapService({network: 'btctestnet'});

const {fee} = await getSwapOutQuote({service, tokens: 1000000});
// Fee is the service fee to perform a swap out
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

# Versions

## 5.5.0

- `lightningLabsSwapsService`:  add `socket` argument to specify custom socket

## 5.4.1

- `createSwapIn`: switch `address` to use native segwit swap address
- `createSwapIn`: add `nested_address` to show alternative nested swap address

## 5.3.4

- `attemptSweep`: add `sends` parameter to specify exact amount sends to attempt

## 5.2.1

- `createSwapIn`: add `in_through` parameter to specify swap inbound peer

## 5.1.2

- `swapUserId`: add method to derive a user id that is encoded in a macaroon

## 5.0.0

Switch to using paid LightningLabs swap service by default

- `getSwapMacaroon`: add method to get a swap macaroon and auth payment request

## 4.1.0

- Add delay parameter to swap out quotes

## 4.0.2

- Add `isSweep` to determine if a raw transaction is a sweep

### Breaking Changes

- `checkQuote`: Eliminate function

## 3.1.1

- `createSwapOut`: Add `fund_at` attribute to specify an acceptable funding time

## 3.0.0

- Add `getSwapInTerms` to look up max and min swap sizes for on-to-off-chain
- Add `getSwapOutTerms` to look up max and min swap sizes for off-to-on-chain
- Add `getSwapInQuote`: attribute `fee` for the total fee of the swap
- Add `getSwapOutQuote`: attribute `fee` for the total fee of the swap

### Breaking Changes

- `createSwapIn`: Remove `base_fee` and `fee_rate`
- `createSwapIn`: Add required argument `fee` to specify fee to pay for swap
- `getSwapInQuote`: Add required `tokens` argument
- `getSwapInQuote`: Remove max and min swap sizes
- `getSwapInQuote`: Remove base fee and fee rate
- `getSwapOutQuote`: Add required `tokens` argument
- `getSwapOutQuote`: Remove max and min swap sizes
- `getSwapOutQuote`: Remove base fee and fee rate

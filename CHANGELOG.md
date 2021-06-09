# Versions

## 10.1.0

- `cancelSwapOut`: Cleanly cancel a swap out

## 10.0.6

- `attemptSweep`: Clamp output value above dust when fees consume all funds

## 10.0.3

- `createSwapIn`: `probe_request` is now required
- `createSwapIn`: Add support for `user_agent`
- `createSwapOut`: Add support for `user_agent`

## 9.0.1

- Fix missing dependency reference

## 9.0.0

### Breaking Changes

- Pass a `metadata` object instead of `macaroon` and `preimage` for authentication.

## 8.0.1

- `getSwapOutQuote`: remove `cltv_delta` from response

### Breaking Change

- `getSwapOutQuote`: `cltv_delta` is undefined, use the `cltv_delta` from the request instead

## 7.1.2

- `decodeSwapRecovery`: Pull out version field from recovery details

## 7.1.0

- `genericSwapService`: Add method to create generic swap server object

##  7.0.2

- `isSweep`: Add support for more raw transaction scenarios

## 7.0.0

Switch swap script to V2:

- `attemptRefund`: Allow specifying the `version` of the swap script
- `createSwapIn`: Returns `version` of the created swap
- `createSwapOut`: Returns `version` of the created swap
- `decodeSwapRecovery`: Returns `version` of the swap recovery
- `encodeSwapRecovery`: Allow specifying `version` of the swap script
- `isSweep`: Add support for detecting v2 sweeps

### Breaking Changes

- `attemptRefund`: Specifying the `version` of the swap script required for v2
- `createSwapIn`: Now creates a version 2 swap
- `createSwapOut`: Now creates a version 2 swap
- `encodeSwapRecovery`: You must now specify the swap version
- `swapInAddress`: Method is removed, use `createSwapIn`: `address`

## 6.1.1

- `swapScriptV2`: Improve overall support for future swap script version

## 6.1.0

- `swapScriptV2`: Add method to support future swap script version

## 6.0.0

- `createSwapOut`: Add argument `timeout` to request a specific swap timeout
- `getSwapOutQuote`: Add argument `timeout` to request a specific swap timeout
- `getSwapOutTerms` add `max_cltv_delta` for server maximum cltv delta tolerance
- `getSwapOutTerms` add `min_cltv_delta` for server minimum cltv delta tolerance
- `subscribeToSwapInStatus`: Add method to track server's view of swap in
- `subscribeToSwapOutStatus`: Add method to track server's view of swap out

### Breaking Changes

- `createSwapOut`: The argument `timeout` is now required
- `getSwapOutQuote`: The argument `timeout` is now required

## 5.8.1

- `createSwapIn`: Add support for `service_message`
- `createSwapOut`: Add support for `service_message`

## 5.7.0

- `getSwapInQuote`: Add support for macaroon and preimage for an api-key quote
- `getSwapInTerms`: Add support for macaroon and preimage for api-key terms
- `getSwapOutQuote`: Add support for macaroon and preimage for an api-key quote
- `getSwapOutTerms`: Add support for macaroon and preimage for api-key terms

## 5.6.0

- `releaseSwapOutSecret`: Add method to release the swap secret to the server

## 5.5.1

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

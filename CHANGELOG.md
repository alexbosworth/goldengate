# Versions

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
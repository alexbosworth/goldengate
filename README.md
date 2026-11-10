# GoldenGate

Utility functions for working with HTLC-based transfers.

[![npm version](https://badge.fury.io/js/goldengate.svg)](https://badge.fury.io/js/goldengate)

## Networks

Supported networks:

- `btc`: Bitcoin mainnet
- `btcregtest`: Bitcoin regtest, for local testing
- `btcsignet`: Bitcoin signet
- `btctestnet`: Bitcoin testnet3

Regtest has no default swap service or Blockstream API: pass the `socket` of a
swap service and use `lnd` for chain data.

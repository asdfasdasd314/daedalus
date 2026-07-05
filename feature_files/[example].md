(Example)

# Crypto Data Client

## Summary
The `crypto` data client provides utilities for fetching market data (candles and trades) from Coinbase, primarily for BTC-USD. It is used for price discovery and historical analysis.

## Key Points
- **Candle Fetching**: Implements automatic pagination to overcome Coinbase's 350-candle limit per request, allowing for arbitrary time ranges and granularities.
- **Trade Fetching**: Uses backwards pagination to retrieve all individual market trades starting from a specific timestamp.
- **Timezone Alignment**: Integrates with `time_format` to align Coinbase UTC data with ET, ensuring consistency with other venue data.

## Relevant Files
- `src/tooling/data_clients/crypto.py`: Logic for fetching candles and trades from Coinbase.

## Dev Mode
TESTING

## State Log
- 2026-06-07: Initialized feature file for the crypto data client.

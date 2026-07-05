# Execution Boundaries (CRITICAL)
- NEVER EXECUTE SOURCE CODE (python, bash, node, script tasks) without explicit standalone user permission in the current turn. Scrapers, tests, research and directory listing are permitted.
- NEVER implement CLI/Command Line Arguments (`--input`, `--mode`). Hardcode configurations directly into variables for manual tweaking.

# Feature File Automation
- Track active progress in `feature_files/{feature_name}.md`. 
- If missing, auto-generate on task initialization.
- Mandatory schema: H1 Title, ## Summary (architecture/tech), ## Key Points (critical edge conditions/logic), ## Relevant Files (source code, tightly paired features), ## Dev Mode, ## State Log.
    - Format feature files like this example:
        Start of content """
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
        """ End of content
- YOU must append a 1-sentence engineering log to the State Log before marking tasks complete.
- When debugging, reference the relevant feature files to reduce lookups because the summaries and key points can give you a good macro-understanding without reading thousands of lines

# 4-Stage Development Lifecycle
Adhere strictly to the execution style mandated by the active feature file's Dev Mode. Prefix your very first response with `> Active Mode: [Stage]`.

1. HACKING: Prototype phase. Omit error-handling, validation boundaries, typing setups, and algorithmic optimization. Maximize readability; write logic a high school CS student can completely parse line-by-line.
2. TESTING: Incremental hardening. Introduce structured unit tests, catch-blocks, and condition validations.
3. PRODUCTION-READY: Enterprise optimization. Implement full validation layers, robust documentation strings, edge-case coverage, and clean structural syntax (dataclasses, slots, performance optimizations).
4. DEBUGGING: Deep diagnostics. Strip defensive abstractions. Maximize structured event logging, granular print statements, and cross-feature execution tracking.

# Alignment
- Do not autonomously upgrade a feature's stage. Log changes in the feature file only after alignment.

# Debugging
- When debugging code, every suspected root cause should include supporting evidence: the file path, relevant line numbers, and function names. Do not present a debugging hypothesis without citing the code that led to it.

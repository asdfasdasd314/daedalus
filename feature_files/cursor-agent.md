# Cursor Agent

## Summary
The Cursor agent provider adapts daemon chat prompts to the locally installed Cursor CLI, returning its parsed JSON result through the shared agent chat payload and using native read-only planning mode when requested.

## Key Points
- **Command Safety**: The prompt is passed as one subprocess argument, never interpolated into a shell command.
- **Availability**: The daemon checks for the `agent` executable before launch and sends an actionable reply when Cursor CLI is unavailable.
- **Result Handling**: Cursor's JSON response is parsed so the final assistant Markdown reaches agent chat; malformed payloads, cancellation, and non-zero exits become actionable replies.
- **Planning**: Planning runs use `--mode=plan` without `--force`, with a prompt-only fallback for older CLIs that reject the mode flag.
- **Permissions**: Non-planning runs retain hardcoded `--force`; planning runs omit it.
- **Auth**: Cursor CLI auth uses `CURSOR_API_KEY` from `local-daemon/.env` (or process env), injected into the `agent` subprocess environment; never stored in parameter files.

## Relevant Files
- `local-daemon/src/daedalus_daemon/main.py`: Provider routing and Cursor process execution.
- `local-daemon/src/daedalus_daemon/__init__.py`: Public daemon exports for the Cursor runner.
- `local-daemon/tests/test_main.py`: Mocked Cursor command, availability, and result-mapping coverage.
- `local-daemon/.env`: Daemon secrets including `CURSOR_API_KEY` (gitignored).
- `parameter_files/cursor-agent.toml`: Reserved feature-level Cursor configuration source.

## Dev Mode
HACKING

## State Log
- 2026-07-10: Added the Cursor CLI daemon provider with safe argument passing, availability reporting, and normalized completion replies.
- 2026-07-10: Stored `CURSOR_API_KEY` in `local-daemon/.env` and inject it into the Cursor `agent` subprocess env so headless runs authenticate without parameter-file secrets.
- 2026-07-11: Parsed Cursor JSON replies and added native, non-force plan-mode execution with a safe legacy fallback.

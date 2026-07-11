# Cursor Agent

## Summary
The Cursor agent provider adapts daemon chat prompts to the locally installed Cursor CLI, running `agent -p --force` from the selected project directory and returning its normalized result through the shared agent chat payload.

## Key Points
- **Command Safety**: The prompt is passed as one subprocess argument, never interpolated into a shell command.
- **Availability**: The daemon checks for the `agent` executable before launch and sends an actionable reply when Cursor CLI is unavailable.
- **Result Handling**: Successful output, cancellation, and non-zero exits are converted into the existing string reply format consumed by agent chat.
- **Permissions**: `--force` remains hardcoded for this initial provider implementation.
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

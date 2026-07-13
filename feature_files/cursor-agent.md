# Cursor Agent

## Summary
The Cursor agent provider adapts daemon chat prompts to the locally installed Cursor CLI, returning parsed JSON for ordinary runs and extracting Cursor's native internal Markdown plan from planning event streams.

## Key Points
- **Command Safety**: The prompt is passed as one subprocess argument, never interpolated into a shell command.
- **Availability**: The daemon checks for the `agent` executable before launch and sends an actionable reply when Cursor CLI is unavailable.
- **Result Handling**: Ordinary Cursor JSON replies are parsed so the final assistant Markdown reaches agent chat; planning replies extract `createPlanToolCall.args.plan`, falling back to the terminal result only when no native plan is present.
- **Planning**: Planning runs use `--trust --mode=plan` without `--force`, with a prompt-only fallback for older CLIs that reject the mode flag.
- **Inline Plan Contract**: Cursor planning must not create a workspace plan document; Daedalus sends the CLI's native internal Markdown plan to chat instead.
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
- 2026-07-11: Added Cursor workspace trust to planning commands so headless plans can run without restoring force permissions.
- 2026-07-11: Entered DEBUGGING mode and added structured Cursor stdout logging for initial and fallback executions.
- 2026-07-11: Switched Cursor-only planning to full stream-json delivery while preserving raw stdout in daemon diagnostics.
- 2026-07-11: Extracted Cursor native plans from `createPlanToolCall` events so Daedalus chat receives the actual Markdown plan instead of progress narration.
- 2026-07-11: Returned to HACKING mode and removed Cursor stdout logging after confirming native-plan extraction.
- 2026-07-13: Made Cursor planning reuse the standard planning instruction body and limited its provider-specific addition to forbidding plan-file output.
- 2026-07-13: Applied the shared optional-questions planning suffix to Cursor plans so clarifications use the same Markdown format as Codex plans.
- 2026-07-13: Added shared refinement context so Cursor planning receives the prior plan and cumulative questionnaire answers.

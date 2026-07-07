# Agent Prompt Chat

## Summary
The agent prompt chat adds a simple prompt composer to the existing dashboard and stores prompt text in Supabase through the shared `communications` table. It keeps the feature-file loading protocol separate by writing each workflow into its own `purpose` row, and now lets the operator scope the next prompt to selected feature files from the graph.

## Key Points
- **Shared Transport**: The dashboard and local daemon both read and write the `communications` table by `purpose` instead of using one shared message row.
- **Prompt Composer**: The MVP UI is one textarea and one send button on the existing dashboard.
- **Purpose Split**: Feature-file loading uses `purpose = "feature_file_load"` and prompt submission uses `purpose = "agent_prompt"`.
- **Prompt Payload**: The `agent_prompt` row stores the `message` as a JSON string with `directory` and `prompt` so the daemon can tell which repo should receive the request.
- **Model Controls**: Codex model and reasoning options are hardcoded in shared JSON, then sent with each prompt payload.
- **Planning Mode**: Planning mode wraps the user prompt with a fixed instruction preamble before daemon execution.
- **Targeted Feature Scope**: The chat panel keeps a separate `Targeted Features` chip row for the next outbound prompt only, and each prompt now carries a `targetedFeaturePaths` list of project-relative `feature_files/*.md` paths.
- **Execution Loop**: The daemon now replaces the queued `agent_prompt` JSON with progress markers, runs `codex exec` inside the requested repo, and posts the latest prompt/reply pair back to the frontend over REST.
- **Chat Progress**: The dashboard watches the `agent_prompt` row so it can show daemon pickup and completion updates while the reply is still being generated.
- **Queued Prompt Safety**: If a newer prompt arrives while an older one is still running, the daemon leaves the newer row in place instead of overwriting it with `daemon_sent_response`.
- **Latest Pair Only**: The UI keeps only the newest submitted prompt and daemon reply instead of a full transcript.
- **Clear Control**: The chat panel now includes a local clear action that hides the current prompt/reply block and suppresses the cached exchange until a new prompt is sent.

## Relevant Files
- `daedalus-site/app/feature-files-dashboard.tsx`: Existing dashboard that now includes the prompt composer and purpose-aware Supabase writes.
- `daedalus-site/lib/agent-chat-cache.ts`: Shared in-memory latest-exchange cache shape for prompt metadata returned from the daemon.
- `daedalus-site/app/api/agent-chat/route.ts`: Local REST endpoint that receives the latest daemon chat reply and serves it back to the browser.
- `daedalus-site/lib/agent-models.ts`: Server helper that loads the shared hardcoded model configuration for the dashboard.
- `shared/agent_models.json`: Shared Codex provider model and reasoning options for the prompt composer and daemon payload.
- `shared/database/migrations/003_add_communication_purpose.sql`: Migration that adds the `purpose` column and backfills the feature-file row.
- `shared/database/schema.sql`: Checked-in schema snapshot for the communications table.
- `local-daemon/src/daedalus_daemon/communications.py`: Purpose-aware Supabase read and write helpers for the daemon.
- `local-daemon/src/daedalus_daemon/main.py`: Feature-file polling plus agent prompt execution and reply delivery.

## Dev Mode
HACKING

## State Log
- 2026-07-05: Initialized the MVP agent prompt chat feature file for the shared dashboard composer and purpose-based communications rows.
- 2026-07-05: Added the dashboard prompt textbox, purpose-aware Supabase writes, and the migration that splits agent prompts from feature-file loading in the shared communications table.
- 2026-07-05: Changed the agent prompt sender to serialize both the repo directory and prompt text into the Supabase message payload for later daemon routing.
- 2026-07-05: Wired the daemon to consume agent prompts, run `codex exec` in the target repo, and return only the latest prompt and reply through a local REST chat endpoint.
- 2026-07-05: Added agent chat progress markers so Supabase now shows daemon receipt and response completion while the prompt reply is still in flight.
- 2026-07-05: Removed the visible polling badge and moved the shared status cards into the top dashboard strip so the chat panel no longer competes with an old corner overlay.
- 2026-07-05: Centered the status cards at the top of the screen and made the chat transcript area scroll inside its own upper-left dev panel so long replies stay contained.
- 2026-07-05: Made the full left-side dev interface collapsible so the graph can take over the screen until the panel is reopened.
- 2026-07-05: Cross-referenced the chat layout notes with the graph dashboard so the feature file now describes the current top status strip and upper-left dev interface positions consistently.
- 2026-07-05: Styled the agent chat transcript scrollbar with a dark track and cyan thumb so it no longer shows the default white scrollbar against the black dashboard panel.
- 2026-07-05: Replaced the hardcoded Daedalus prompt target with a project picker sourced from the loaded feature-file projects and applied dark scrollbar styling to the remaining chat form controls.
- 2026-07-06: Added shared Codex model controls, reasoning selection, and a planning-mode prompt wrapper for daemon-run agent chat requests.
- 2026-07-05: Removed the temporary graph-availability loading note from the agent prompt chat controls so the top action row stays visually quieter during feature-file reloads.
- 2026-07-05: Bounded the full left-side dev interface to the viewport bottom and moved chat overflow into a single panel-level scroller so the chat content no longer cuts off at the bottom.
- 2026-07-06: Added targeted-feature chips to the chat composer, sent `targetedFeaturePaths` with `agent_prompt`, and prefixed daemon prompts with sanitized feature-file context after planning text and before the raw user request.
- 2026-07-06: Added a local clear button to the agent prompt chat so the current transcript can be hidden without mutating the daemon-backed `agent_prompt` row.
- 2026-07-06: Hardened the daemon chat completion path so a newer queued prompt is preserved when an older codex run finishes instead of being overwritten by the completion marker.
- 2026-07-06: Fixed the daemon chat handoff to send `promptId` and the rest of the reply payload in the correct order, and updated the daemon tests to cover the JSON state-marker flow used by queued prompt preservation.

# Agent Prompt Chat

## Summary
The agent prompt chat adds a reusable prompt composer to the existing dashboard and stores prompt text in Supabase through the user-owned `communications` table. It keeps the feature-file loading protocol separate by writing each workflow into its own `purpose` row, and now lets the operator scope the next prompt to selected feature files from the graph whether the chat is opened for a brand-new feature session or from a selected feature node.

## Key Points
- **Shared Transport**: The dashboard and local daemon both read and write the `communications` table by `user_id` and `purpose` instead of using one shared message row.
- **Prompt Composer**: The frontend now reuses one chat session panel across the new-feature overlay and the feature-detail chat tab instead of keeping chat pinned in a permanent left column.
- **Purpose Split**: Feature-file loading uses `purpose = "feature_file_load"` and prompt submission uses `purpose = "agent_prompt"`.
- **Prompt Payload**: The `agent_prompt` row stores the `message` as a JSON string with `directory` and `prompt` so the daemon can tell which repo should receive the request.
- **Model Controls**: Codex model and reasoning options are stored in frontend-local JSON, then sent with each prompt payload.
- **Planning Mode**: Planning mode wraps the user prompt with a fixed instruction preamble before daemon execution.
- **Targeted Feature Scope**: The chat panel keeps a separate `Targeted Features` chip row for the next outbound prompt only, and each prompt now carries a `targetedFeaturePaths` list of project-relative `feature_files/*.md` paths.
- **Execution Loop**: Planning prompts keep the direct `agent_prompt` message path, while agent-mode prompts become durable `agent_tasks` consumed by the Git worktree orchestrator; both return the latest prompt/reply pair through `daemon_payloads`.
- **Chat Progress**: The dashboard watches the `agent_prompt` row so it can show daemon pickup and completion updates while the reply is still being generated.
- **Orchestrator Completion**: The dashboard polls the durable `daemon_events` stream, including the orchestrator's final successful-integration event, so resolver warnings are replaced by a visible completion notification after promotion.
- **Queued Prompt Safety**: If a newer prompt arrives while an older one is still running, the daemon leaves the newer row in place instead of overwriting it with `daemon_sent_response`.
- **Latest Pair Only**: The UI keeps only the newest submitted prompt and daemon reply instead of a full transcript.
- **Clear Control**: The chat panel now includes a local clear action that hides the current prompt/reply block and suppresses the cached exchange until a new prompt is sent.
- **Mobile Fitting**: The shared chat panel now stacks its feature-tag controls cleanly on narrow screens, shows daemon-root-relative project labels with optional clipping, and wraps transcript content instead of forcing horizontal overlay scroll.
- **Markdown Reply Visualizer**: A completed latest reply defaults to a safe formatted Markdown view with GitHub-flavored tables and task lists, while an adjacent Raw control preserves the whitespace-pre-wrapped, copy-friendly transcript.
- **Predictable Reply View State**: The shared panel resets the reply visualizer to Formatted whenever the latest exchange changes or chat is cleared, so a new daemon response never inherits a stale Raw selection.
- **Reply Content Fitting**: The compact segmented control wraps at phone widths, and code blocks and tables scroll within the reply bubble so they cannot widen the overlay or page.
- **Reply Copy Control**: A bottom-right Copy button on the agent reply bubble writes the raw daemon response text to the clipboard, independent of Formatted vs Raw view.
- **Prompt Copy Control**: A bottom-right Copy button on the user prompt bubble writes the submitted prompt text to the clipboard so it can be reused or edited elsewhere.
- **Durable Task Clear**: The durable agent-task list includes an inline clear action that requires `Confirm` or `Undo` before deleting the authenticated user's persisted task rows.

## Relevant Files
- `daedalus-site/app/feature-files-dashboard.tsx`: Workspace shell that mounts the shared chat session inside the new-feature and feature-detail overlays.
- `daedalus-site/app/agent-session-panel.tsx`: Shared prompt composer UI with project/model/planning controls, feature tagging, durable-task clear confirmation, retry actions, and the latest chat transcript.
- `daedalus-site/package.json`: Declares the safe Markdown renderer and GitHub-flavored Markdown plugin used by the shared reply visualizer.
- `shared/database/migrations/008_auth_scoped_daedalus.sql`: Adds the user-owned daemon payload row used for latest chat replies.
- `daedalus-site/lib/agent-models.ts`: Server helper that loads the frontend-owned model configuration for the dashboard.
- `daedalus-site/config/agent_models.json`: Frontend-local Codex provider model and reasoning options for the prompt composer.
- `shared/database/migrations/003_add_communication_purpose.sql`: Migration that adds the `purpose` column and backfills the feature-file row.
- `shared/database/migrations/010_allow_agent_task_clear.sql`: Adds the authenticated owner-only delete policy used by the durable-task clear control.
- `shared/database/schema.sql`: Checked-in schema snapshot for the communications table.
- `local-daemon/src/daedalus_daemon/communications.py`: Purpose-aware Supabase read and write helpers for the daemon.
- `local-daemon/src/daedalus_daemon/main.py`: Feature-file polling plus agent prompt execution and reply delivery.
- `shared/database/migrations/009_git_worktree_orchestrator.sql`: Defines the user-scoped `daemon_events` table that carries orchestration completion notifications to the dashboard.
- `feature_files/cursor-agent.md`: Cursor execution provider used by the shared prompt transport.
- `feature_files/daedalus-git-worktrees.md`: Durable agent-mode queue, isolation, verification, and integration lifecycle.

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
- 2026-07-08: Moved latest agent chat replies from the local Next cache route into user-owned Supabase daemon payloads.
- 2026-07-08: Moved the model catalog into `daedalus-site/config/agent_models.json` so the prompt composer no longer treats frontend-only model choices as shared repo config.
- 2026-07-09: Split the chat UI out into a shared overlay session panel so new-feature creation and node-focused editing both reuse the same prompt transport and feature-tagging flow.
- 2026-07-09: Reflowed the shared chat session panel for phone-width overlays by stacking feature-tag controls and forcing both prompt and reply bubbles to wrap instead of pushing the overlay wider than the viewport.
- 2026-07-09: Clipped the selected project display to a mobile-safe tail label and tightened transcript/status widths so the shared chat panel stops drifting off the phone viewport while keeping the full project path in the picker itself.
- 2026-07-09: Switched the shared project picker over to daemon-root-relative labels so the chat overlays never need to show absolute paths while still clipping long names safely on phones.
- 2026-07-10: Added GPT-5.6 Sol/Terra/Luna to the Codex model catalog with light/medium/high/extra-high/ultra reasoning (default medium) and mapped the new labels through the daemon for `codex exec`.
- 2026-07-10: Connected the shared agent chat provider selector to the Cursor daemon adapter while preserving the Codex prompt path.
- 2026-07-10: Added a shared safe Markdown/raw reply visualizer with GFM tables and task lists, local reset behavior, and mobile-contained long content.
- 2026-07-10: Added a bottom-right Copy button on the agent reply bubble that copies the raw daemon response to the clipboard.
- 2026-07-11: Routed agent-mode submissions through durable orchestrator tasks while retaining the existing direct Planning Mode transport.
- 2026-07-12: Added a bottom-right Copy button on the user prompt bubble that copies the submitted prompt text to the clipboard.
- 2026-07-12: Added an inline Confirm/Undo clear control for durable agent tasks, backed by an owner-scoped Supabase delete policy and REST delete request.
- 2026-07-12: Removed the Cursor CLI file-edit permissions helper text from the shared agent prompt chat controls.
- 2026-07-12: Resolved the integration conflict while preserving durable-task clearing and Cursor helper-text removal.
- 2026-07-12: Added the durable orchestrator success event consumed by the dashboard so a completed integration reports success after any resolver warnings.

# Agent Output Viewer

## Summary
The Agent Output Viewer is the durable, authenticated history and live-status surface for standard, planning, and ask prompts. It composes transient direct-prompt queue state, authoritative durable-task lifecycle state, and the `agent_output_history` archive into one feature-centric workspace drawer without becoming a general daemon-log viewer.

## Key Points
- **Durable Projection**: One `agent_output_history` row is stored per user and prompt ID, preserving prompt metadata, raw output, terminal error, concise outcome, and lifecycle timestamps after transient task rows are cleared.
- **Unified Read Model**: Active direct prompts and durable tasks supply current lifecycle state while history supplies archived content; records merge by prompt ID.
- **Feature Discovery**: A multi-feature prompt remains one database record and is presented beneath every repository-qualified targeted feature, with separate All activity and Unscoped groups.
- **Planning Conversation**: A planning conversation ID links the initial request, every refinement, and the implementation task so the viewer presents one chronological transcript: initial prompt, planning questions and plan, then the implementation response or terminal error.
- **Workspace Drawer**: A true upper-left history control opens a responsive drawer that is mutually exclusive with Ventures and supports notification deep links.
- **Archive Controls**: The viewer owns formatted/raw output, copying, search, stable pagination, retry, abandon, cancel, finalized-task cleanup, and per-exchange delete for Completed/Failed prompt-answer pairs.

## Relevant Files
- `shared/database/migrations/018_agent_output_history.sql`: Durable history table, policies, RPCs, task projection trigger, and recoverable backfills.
- `shared/database/migrations/019_allow_agent_output_history_delete.sql`: Owner delete policy for Completed/Failed history rows.
- `shared/database/migrations/020_planning_conversation_history.sql`: Durable planning conversation linkage for direct prompts and implementation tasks.
- `shared/database/migrations/024_repair_agent_tasks_cancel_requested.sql`: Idempotent repair when live `agent_tasks` is missing `cancel_requested` (breaks History hydration selects).
- `shared/database/schema.sql`: Current database schema snapshot.
- `parameter_files/agent-output-viewer.toml`: Viewer-owned tunable settings.
- `local-daemon/src/daedalus_daemon/communications.py`: Narrow direct-prompt history upsert transport.
- `local-daemon/src/daedalus_daemon/main.py`: Direct planning and ask execution publication.
- `daedalus-site/lib/agent-output-history.ts`: History types, normalization, grouping, merging, pagination, and search helpers.
- `daedalus-site/app/agent-output-viewer.tsx`: Responsive live and archived prompt drawer.
- `daedalus-site/app/agent-output-detail.tsx`: Reusable prompt/output Markdown, raw, overflow, and copy presentation.
- `daedalus-site/app/feature-files-dashboard.tsx`: Workspace trigger, active-source composition, overlay routing, and notification history selection.
- `daedalus-site/app/agent-session-panel.tsx`: Prompt-only Edit composer and submission handoff.

## Dev Mode
HACKING

## State Log
- 2026-07-13: Initialized the Agent Output Viewer ownership boundary, durable-history architecture, workspace placement, and prompt-only Edit relationship.
- 2026-07-13: Implemented owner-scoped durable history projection and backfill, direct planning/ask publication, the unified responsive History drawer, planning and task controls, archive search/pagination, Edit cutover, and notification deep links.
- 2026-07-13: Kept Ask-mode failures publishable to the viewer after removing the unsupported Codex approval argument from direct execution.
- 2026-07-13: Added Completed/Failed-only trash delete on each prompt-answer chat box with owner-scoped history and matching durable-task cleanup.
- 2026-07-13: Kept direct planning and Ask history publication asynchronous so a long-running exchange no longer delays durable task lifecycle updates in the viewer.
- 2026-07-13: Integrated terminal-exchange deletion and asynchronous direct-prompt status publication while preserving Ask-mode failure visibility.
- 2026-07-13: Diagnosed a failed Cursor standard task whose clean, unchanged worktree confirmed that the provider returned an informal plan without making implementation changes; no viewer lifecycle defect was found.
- 2026-07-13: Linked planning refinements and their implementation handoff with a durable conversation ID, then rendered the full chronological transcript in History.
- 2026-07-14: History open/Refresh now reloads recent in-progress archive rows and rehydrates live durable tasks on demand, with merge preferring fresher terminal history over stale live queued.
- 2026-07-14: Diagnosed persistent History hydration failures as live Supabase missing `agent_tasks.cancel_requested` (select returns 400); added repair migration 024 and surfaced query error bodies.

# Agent Output Viewer

## Summary
The Agent Output Viewer is the durable, authenticated history and live-status surface for standard, planning, and ask prompts. It composes transient direct-prompt queue state, authoritative durable-task lifecycle state, and the `agent_output_history` archive into one feature-centric workspace drawer without becoming a general daemon-log viewer.

## Key Points
- **Separate Integration Lifecycle**: Blocked integration batches are rendered independently from completed task implementation output, so a merge failure never overwrites the task's verified outcome.
- **In-Place Recovery**: Retried tasks and integrations retain their original worktree and durable record whenever that worktree remains available; a blocked batch reserves its member tasks so recovery never creates a competing integration batch or duplicate workspace.
- **Durable Projection**: One `agent_output_history` row is stored per user and prompt ID, preserving prompt metadata, raw output, terminal error, concise outcome, and lifecycle timestamps after transient task rows are cleared.
- **Unified Read Model**: Active direct prompts and durable tasks supply current lifecycle state while history supplies archived content; records merge by prompt ID.
- **Feature Discovery**: A multi-feature prompt remains one database record and is presented beneath every repository-qualified targeted feature, with separate All activity and Unscoped groups.
- **Planning Conversation**: A planning conversation ID links the initial request, every refinement, and the implementation task so the viewer presents one chronological transcript: initial prompt, planning questions and plan, then the implementation response or terminal error.
- **Compact Plan Review**: Planning conversations initially limit their original prompt and agent plan to a small preview, with a per-card control to reveal the complete content before implementation.
- **Workspace Drawer**: A true upper-left history control opens a responsive drawer that is mutually exclusive with Ventures and supports notification deep links.
- **Archive Controls**: The viewer owns formatted/raw output, copying, search, stable pagination, retry, abandon, cancel, finalized-task cleanup, and per-exchange delete for every finalized prompt-answer pair (`completed`, `failed`, `blocked`, or `cancelled`).
- **Summary-First Archive**: Archive pages and searches return fixed-size prompt snippets and lifecycle metadata without output/error bodies; selecting a conversation fetches its bounded full prompt, output, and error records so the detail pane renders the original request and complete plan/agent response.
- **Architecture View Handoff**: Completed durable exchanges expose View or Regenerate actions, while older exchanges without immutable commit capture remain explicitly unavailable.
- **Persistent Architecture Rail**: Architecture View keeps History, search, feature groups, exchange selection, and a compact selected-exchange action area visible as a fixed left rail without owning diagram layout.

## Relevant Files
- `shared/database/migrations/018_agent_output_history.sql`: Durable history table, policies, RPCs, task projection trigger, and recoverable backfills.
- `shared/database/migrations/019_allow_agent_output_history_delete.sql`: Original owner delete policy for history rows.
- `shared/database/migrations/025_allow_terminal_agent_output_history_delete.sql`: Owner delete policy for every finalized history row.
- `shared/database/migrations/020_planning_conversation_history.sql`: Durable planning conversation linkage for direct prompts and implementation tasks.
- `shared/database/migrations/024_repair_agent_tasks_cancel_requested.sql`: Idempotent repair when live `agent_tasks` is missing `cancel_requested` (breaks History hydration selects).
- `shared/database/schema.sql`: Current database schema snapshot.
- `shared/database/migrations/030_task_and_batch_failure_recovery.sql`: Guarded task/batch retry and daemon-synchronized deletion requests.
- `shared/database/migrations/034_blocked_batch_task_reservation.sql`: Keeps a blocked batch's member tasks out of fresh collection until the original batch is retried or deleted.
- `parameter_files/agent-output-viewer.toml`: Viewer-owned tunable settings.
- `local-daemon/src/daedalus_daemon/communications.py`: Narrow direct-prompt history upsert transport.
- `local-daemon/src/daedalus_daemon/main.py`: Direct planning and ask execution publication.
- `daedalus-site/lib/agent-output-history.ts`: History types, normalization, grouping, merging, pagination, and search helpers.
- `daedalus-site/app/agent-output-viewer.tsx`: Responsive live/archive drawer and persistent architecture-rail presentation.
- `daedalus-site/app/agent-output-detail.tsx`: Reusable prompt/output Markdown, raw, overflow, and copy presentation.
- `daedalus-site/app/feature-files-dashboard.tsx`: Workspace trigger, active-source composition, overlay routing, and notification history selection.
- `daedalus-site/app/agent-session-panel.tsx`: Prompt-only Edit composer and submission handoff.
- `feature_files/system-architecture-communication-engine.md`: Dependency boundary for commit-scoped Architecture View generation and persistence.

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
- 2026-07-14: Expanded viewer and owner-scoped archive deletion to every finalized output state, including blocked and cancelled records.
- 2026-07-14: Kept the planning workflow controls driven by the shared normalized questionnaire parser so fenced planner output presents its pending answers instead of an implementation-only action.
- 2026-07-14: Moved active questionnaire controls into the visible planning response and delayed response publication until its restored session is ready, keeping answer choices and custom submission available.
- 2026-07-14: Made archive pages and search summary-first, removed duplicate open-time loads, and bounded conversation retrieval with stable `(created_at, id)` pagination.
- 2026-07-14: Restored full original prompts and agent output in the selected conversation pane through a one-time bounded detail fetch, while preserving summary-only archive and search egress.
- 2026-07-16: Added the completed-task Architecture View entry point, nested cached report presentation, regeneration state, and forward-only unavailable treatment.
- 2026-07-16: Refactored History into drawer and persistent architecture-rail presentations, removed nested Markdown rendering, and routed View/Regenerate actions to the dashboard-owned canvas target.
- 2026-07-16: Hardened failed and cancelled direct-prompt retry by loading the full original prompt before resubmission, with a visible preparation state and fallback behavior when detail retrieval fails.
- 2026-07-16: Resolved the integration conflict by retaining both the architecture-rail handoff and full-prompt retry behavior in the merged viewer contract.
- 2026-07-16: Preserved hydrated planning prompts and responses across newer summary-only archive refreshes so the viewer does not blank before replacement detail arrives.
- 2026-07-16: Resolved the follow-up integration conflict by retaining architecture actions, full-prompt retry, and planning-detail preservation together in the viewer contract.
- 2026-07-16: Corrected hydrated-detail selection to recognize truncated prompts without blocking a newer full planning response from replacing the preserved output.
- 2026-07-16: Added separate integration-batch visibility plus guarded task/batch recovery and daemon-synchronized finalized-task deletion requests, while collapsing planning prompts and plans behind an explicit Show full control.
- 2026-07-16: Removed an unreachable completed-batch filter from dashboard inbox reconciliation so its declared active/blocked batch contract type-checks correctly.
- 2026-07-16: Diagnosed blocked-integration history loss: member tasks remain `ready` without `completed_at`, the archive correctly excludes them, and the dashboard's intended durable-task poll is referenced but never invoked, so its live fallback does not receive those task rows after initial hydration.
- 2026-07-16: Started the configured durable-task client-review poll so terminal task updates continue to hydrate the History live model after its initial load.
- 2026-07-17: Added daemon-synchronized deletion for blocked integration batches, preserving verified task output while cleaning worktrees and preventing dismissed work from being rebatched.
- 2026-07-17: Reserved blocked integration members from fresh daemon collection so retries remain in-place on the original batch and retained worktree instead of creating duplicate integration cards or workspaces.

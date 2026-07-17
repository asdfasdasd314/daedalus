# Recurrent Row Review Protocol

## Summary
The recurrent row review protocol prevents the client, daemon, and manager from repeatedly transferring full Supabase rows. Every recurrent transport row has a strict `message` state: `daemon_review`, `client_review`, `daemon_complete`, or `client_complete`. The browser and daemon each consume one bounded recipient inbox per five-second cycle, while the manager publishes its heartbeat and receives control state through one five-second tick.

## Key Points
- **Recipient-Owned Reads**: The daemon polls only `daemon_review` rows and the client polls only `client_review` rows.
- **One-Time Payload Delivery**: Daemon payloads are marked `client_review` on write and become `client_complete` only after the browser consumes the payload.
- **Communications Content**: `communications.message` is protocol state; nullable `content` carries agent prompts, parameter edits, and git-sync requests. Feature and parameter load requests need no content.
- **Durable Work**: Active orchestrator tasks and batches remain `daemon_review` until terminal work is ready for the client or fully complete.
- **Safe Acknowledgements**: Client completion updates include the expected review state, so an older response cannot acknowledge newer content.
- **No Recurrent Archives**: Historical task, feature-run, and agent-output data loads only during hydration or explicit user requests; idle polling is recipient-filtered and bounded.
- **Selected Archive Detail**: Archive lists and searches remain summary-only, while selecting an agent-output conversation makes one bounded, on-demand request for its full prompt, output, and error bodies.
- **Control-Plane Coverage**: Manager heartbeat and restart-control rows use the same protocol and generation-aware client acknowledgement.
- **Measured Budget**: The pre-remediation baseline was approximately 4,320 browser, 5,040 daemon, and 3,600 manager recurrent requests per hour; acceptance is at most 720 per component and 2,160 combined for one visible idle browser, daemon, and manager.
- **Consolidated Browser Inbox**: `get_client_review_inbox()` returns explicitly projected, deterministically ordered, fixed-bound client-review collections, and `acknowledge_client_reviews()` guards every mutable receipt by review state and `updated_at` (plus monotonic generation where applicable).
- **Durable Batch Tombstones**: Successful integration events retain `batch_id`, retry generation, and their own review timestamp after the transient batch row is deleted, allowing the browser to remove only the completed generation.
- **Consolidated Daemon Snapshot**: `daemon_poll_work()` returns communications, scheduling-only task and batch records, bounded Architecture View requests, active run controls, and one atomic feature-run claim without unreviewed large result fields.
- **Architecture Document Delivery**: Architecture generation metadata enters the daemon snapshot without document bodies; validated `architecture_document` JSON transfers only from an explicit bounded `client_review` row and acknowledgements match both `updated_at` and the monotonic generation.
- **Empty-Poll Contract**: Empty inboxes return arrays or `null`, produce no acknowledgement request, and are measured with aggregate request-count and response-byte logging rather than per-poll messages.
- **Visibility and Cadence**: Visible browser polling is completion-scheduled every five seconds, hidden-page polling backs off to at least thirty seconds, visibility restoration refreshes immediately, and manager database cadence matches its five-second heartbeat.

## Relevant Files
- `shared/database/migrations/013_recurrent_row_review_protocol.sql`: Schema migration and daemon RPC protocol changes.
- `shared/database/schema.sql`: Current schema snapshot.
- `local-daemon/src/daedalus_daemon/communications.py`: Daemon review queries and state updates.
- `local-daemon/src/daedalus_daemon/main.py`: Communications request handling.
- `local-daemon/src/daedalus_daemon/orchestrator.py`: Durable task and batch state transitions.
- `local-daemon-manager/src/daedalus_daemon_manager/communications.py`: Recipient-filtered manager request reads and guarded control acknowledgements.
- `local-daemon-manager/src/daedalus_daemon_manager/main.py`: Manager request lifecycle consumption.
- `daedalus-site/app/feature-files-dashboard.tsx`: Client review polling and acknowledgements.
- `daedalus-site/app/daemon-manager-panel.tsx`: Heartbeat review consumption and timestamp-guarded acknowledgement.
- `daedalus-site/app/agent-output-viewer.tsx`: On-demand historical output loading.
- `AGENTS.md`: Project-wide recurrent Supabase read requirements.
- `shared/database/migrations/023_complete_recurrent_supabase_read_hardening.sql`: Remaining control-plane protocol migration and review indexes.
- `shared/database/migrations/027_recurrent_supabase_egress_remediation.sql`: Consolidated browser, daemon, and manager RPCs, bounded projections, and batched acknowledgements.
- `shared/database/migrations/029_system_architecture_visualization_engine.sql`: Generation-guarded structured Architecture View completion and reviewed JSON delivery.
- `shared/database/migrations/035_agent_output_viewer_reliability.sql`: Completes daemon-event generation projection and timestamp-guarded client acknowledgement.
- `shared/database/migrations/036_preserve_batch_retry_worktree.sql`: Adds bounded retry-generation projection to the existing daemon work snapshot.

## Dev Mode
TESTING

## State Log
- 2026-07-12: Initialized the recurrent row review protocol feature for recipient-scoped Supabase polling.
- 2026-07-12: Added the four-state schema contract, recipient-filtered Supabase queries, and conditional client acknowledgements for recurring transports.
- 2026-07-12: Changed the daemon-event review index to a client-review partial index so oversized historical event content cannot enter a B-tree key.
- 2026-07-13: Diagnosed rejected development-environment load writes as a database migration prerequisite because the frontend now writes the new communications content and review-state fields.
- 2026-07-13: Added an idempotent follow-up migration for the partially committed protocol migration and surfaced Supabase response details for failed load requests.
- 2026-07-13: Fixed payload-free load requests so a present `daemon_review` row with null content is distinguishable from no review row and reaches the daemon scanner.
- 2026-07-13: Made orchestration-batch review state derive from terminal status and added a migration to complete stale terminal batch rows.
- 2026-07-13: Gated execution-producing `daemon_review` writes during manager drains while preserving client acknowledgements and daemon completion publication.
- 2026-07-14: Removed recurrent archive transfers, bounded all remaining client review queries, consolidated daemon communications, and extended the protocol to manager control rows.
- 2026-07-14: Completed the recurrent-read audit by filtering manager drain summaries, making cancellation a generation-guarded daemon handoff, and documenting the mandatory protocol in the root agent instructions.
- 2026-07-14: Documented a remediation plan covering idle poll cadence, bounded recurrent RPC projections, one-time large-payload delivery, explicit historical pagination, and egress regression verification.
- 2026-07-14: Implemented the consolidated browser inbox, daemon work snapshot, five-second manager tick, generation-safe batch acknowledgements, bounded archive and scanner transfers, aggregate egress instrumentation, and static regression assertions.
- 2026-07-14: Repaired the cancellation-check regression test to mock the new task-scoped control lookup instead of the retired full task-list refresh.
- 2026-07-14: Preserved summary-only archive transport while allowing a user-selected agent-output conversation to retrieve its full durable prompt and response bodies once.
- 2026-07-16: Added bounded Architecture View work metadata, explicit reviewed Markdown delivery, drain coverage, and generation-plus-timestamp stale acknowledgement protection.
- 2026-07-16: Replaced reviewed Markdown delivery with an explicit bounded `architecture_document` projection while keeping the daemon projection payload-free and acknowledgement generation-plus-timestamp guarded.
- 2026-07-16: Confirmed summary-only agent-output archive refreshes retain already-hydrated viewer detail locally while the bounded refresh updates lifecycle metadata.
- 2026-07-16: Resolved the follow-up integration conflict by preserving both structured Architecture View delivery and hydrated History detail across bounded refreshes.
- 2026-07-17: Consolidated terminal task and daemon-event delivery under the single browser inbox and added durable, generation-scoped batch completion acknowledgements.
- 2026-07-17: Projected batch retry generations through the bounded daemon snapshot so retained manual retries are distinguishable from new integrations without adding a recurrent transport.

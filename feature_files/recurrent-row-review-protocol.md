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
- **Control-Plane Coverage**: Manager heartbeat and restart-control rows use the same protocol and generation-aware client acknowledgement.
- **Measured Budget**: The pre-remediation baseline was approximately 4,320 browser, 5,040 daemon, and 3,600 manager recurrent requests per hour; acceptance is at most 720 per component and 2,160 combined for one visible idle browser, daemon, and manager.
- **Consolidated Browser Inbox**: `get_client_review_inbox()` returns six explicitly projected, deterministically ordered, fixed-bound client-review collections, and `acknowledge_client_reviews()` guards mutable receipts by both review state and `updated_at` generation.
- **Consolidated Daemon Snapshot**: `daemon_poll_work()` returns communications, scheduling-only task and batch records, active run controls, and one atomic feature-run claim without large result, verification, or nonterminal diagnostic fields.
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

## Dev Mode
TESTING

## Remediation Plan
1. **Set an idle request budget and reduce poll cadence.** Inventory every browser, daemon, and manager recurring query/RPC, make each call site declare its idle interval, and raise the manager control loop from one second to a cadence aligned with its five-second heartbeat unless a user-visible control action needs a faster one-shot refresh. Remove duplicate task/batch reads within a daemon orchestration cycle by sharing the cycle snapshot or querying each owned transport once.
2. **Make every recurrent daemon read bounded and projection-only.** Replace `select *` in `daemon_list_agent_tasks`, `daemon_list_orchestration_batches`, and `daemon_list_active_feature_execution_runs` with explicit, minimal columns needed for scheduling and state transitions. Add bounded limits appropriate to each queue and move `result`, `verification_output`, `stdout_tail`, and `stderr_tail` behind recipient-review delivery or explicit on-demand detail reads. Add an explicit bound to `daemon_list_communication_reviews` even though its current uniqueness constraint keeps it small.
3. **Keep large payloads one-time and size-aware.** Preserve feature-file and parameter-file snapshots as client-review payloads, but define a maximum snapshot size and a clear overflow behavior (for example, metadata-first listing plus an on-demand file read). Ensure large task and batch results are published only after terminal state and are never returned by active daemon polling projections.
4. **Constrain historical output reads without weakening explicit viewing.** Replace archive-viewer `select *` queries with explicit summary projections; fetch full prompt, output, and error fields only after the user selects a record. Paginate conversation turns with a fixed page size and an explicit “load older turns” action rather than loading an entire conversation at once.
5. **Add protocol and egress regression coverage.** Extend migration/schema tests to assert recipient-state filtering, selected columns, bounded limits, and generation-guarded acknowledgements for every recurrent transport. Add call-count tests or instrumentation for idle browser, daemon, and manager loops, plus payload-size fixtures proving that large result/output fields cannot appear in recurrent responses. Record a baseline and acceptance target for idle calls/hour and bytes/hour before changing cadence, then verify the post-change profile in a development environment.
6. **Roll out safely and observe.** Land schema/RPC projection changes with a migration and schema snapshot update before updating callers; deploy cadence changes behind the existing control-plane behavior without introducing recurrent archive polling. Monitor request rate, response bytes, review-row backlog, acknowledgement conflicts, and control latency after rollout; retain a one-shot/manual refresh path for operator actions.

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

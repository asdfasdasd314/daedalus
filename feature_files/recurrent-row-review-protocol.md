# Recurrent Row Review Protocol

## Summary
The recurrent row review protocol prevents the client and daemon from repeatedly transferring full Supabase rows. Every recurrent transport row has a strict `message` state: `daemon_review`, `client_review`, `daemon_complete`, or `client_complete`. A system fetches a full row only when the state asks that system to review it, then acknowledges completion.

## Key Points
- **Recipient-Owned Reads**: The daemon polls only `daemon_review` rows and the client polls only `client_review` rows.
- **One-Time Payload Delivery**: Daemon payloads are marked `client_review` on write and become `client_complete` only after the browser consumes the payload.
- **Communications Content**: `communications.message` is protocol state; nullable `content` carries agent prompts, parameter edits, and git-sync requests. Feature and parameter load requests need no content.
- **Durable Work**: Active orchestrator tasks and batches remain `daemon_review` until terminal work is ready for the client or fully complete.
- **Safe Acknowledgements**: Client completion updates include the expected review state, so an older response cannot acknowledge newer content.
- **No Recurrent Archives**: Historical task, feature-run, and agent-output data loads only during hydration or explicit user requests; idle polling is recipient-filtered and bounded.
- **Control-Plane Coverage**: Manager heartbeat and restart-control rows use the same protocol and generation-aware client acknowledgement.

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
- `shared/database/migrations/022_complete_recurrent_supabase_read_hardening.sql`: Remaining control-plane protocol migration and review indexes.

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

# Recurrent Row Review Protocol

## Summary
The recurrent row review protocol prevents the client and daemon from repeatedly transferring full Supabase rows. Every recurrent transport row has a strict `message` state: `daemon_review`, `client_review`, `daemon_complete`, or `client_complete`. A system fetches a full row only when the state asks that system to review it, then acknowledges completion.

## Key Points
- **Recipient-Owned Reads**: The daemon polls only `daemon_review` rows and the client polls only `client_review` rows.
- **One-Time Payload Delivery**: Daemon payloads are marked `client_review` on write and become `client_complete` only after the browser consumes the payload.
- **Communications Content**: `communications.message` is protocol state; nullable `content` carries agent prompts, parameter edits, and git-sync requests. Feature and parameter load requests need no content.
- **Durable Work**: Active orchestrator tasks and batches remain `daemon_review` until terminal work is ready for the client or fully complete.
- **Safe Acknowledgements**: Client completion updates include the expected review state, so an older response cannot acknowledge newer content.

## Relevant Files
- `shared/database/migrations/013_recurrent_row_review_protocol.sql`: Schema migration and daemon RPC protocol changes.
- `shared/database/schema.sql`: Current schema snapshot.
- `local-daemon/src/daedalus_daemon/communications.py`: Daemon review queries and state updates.
- `local-daemon/src/daedalus_daemon/main.py`: Communications request handling.
- `local-daemon/src/daedalus_daemon/orchestrator.py`: Durable task and batch state transitions.
- `daedalus-site/app/feature-files-dashboard.tsx`: Client review polling and acknowledgements.

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

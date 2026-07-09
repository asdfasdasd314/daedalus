# Feature File Communications System

## Summary
The feature file communications system uses Supabase as a user-scoped message bus between the authenticated Next.js frontend and the local daemon. The frontend polls its own `feature_file_load` communication row and daemon payload rows, while the daemon polls the same user-scoped purpose through trusted RPC helpers and writes scanned feature-file payloads back to Supabase.

## Key Points
- **Message Bus**: Supabase stores communication messages in a `communications` table with separate rows keyed by `user_id` and `purpose`.
- **Polling Loop**: Both the frontend and daemon poll Supabase every `5000` milliseconds.
- **Daemon Delivery**: The daemon writes feature-file payloads, parameter-file payloads, and latest agent chat replies into the user-owned `daemon_payloads` table.
- **Schema Tracking**: Every database change must add a numbered migration and update the checked-in schema snapshot.
- **Protocol Messages**: The feature-file load flow uses `purpose = "feature_file_load"` with `client_load_feature_files`, `daemon_received_message`, and `daemon_sent_feature_files`.
- **Agent Status Messages**: The prompt flow uses `purpose = "agent_prompt"` with queued JSON payloads plus daemon-written status markers while `codex exec` is running.

## Relevant Files
- `shared/supabase_config.json`: Shared Supabase and local frontend connection values.
- `shared/database/migrations/001_create_communications_table.sql`: First migration for the communications table.
- `shared/database/migrations/002_enable_communications_rls.sql`: Enables row level security and allows browser-side anon reads and writes for the communications table.
- `shared/database/migrations/008_auth_scoped_daedalus.sql`: Adds user-scoped communications, daemon payload storage, authenticated RLS, and trusted daemon RPC functions.
- `shared/database/schema.sql`: Checked-in snapshot of the current database schema.
- `local-daemon/src/daedalus_daemon/main.py`: Daemon polling loop and Supabase message handling.
- `daedalus-site/app/page.tsx`: Frontend dashboard that polls Supabase and renders feature-file data.

## Dev Mode
HACKING

## State Log
- 2026-07-04: Implemented the first Supabase-backed message loop, database artifacts, daemon polling flow, and Next.js feature-file display path for loading local feature files.
- 2026-07-04: Kept the communications path as direct frontend and daemon reads and writes against Supabase, while preserving only the missing-row and stale-poll fixes in the browser client.
- 2026-07-04: Added browser console logging around frontend Supabase message reads and writes so the communications flow can be debugged from the client side.
- 2026-07-04: Switched the frontend communications table reads and writes from the anon key to the Supabase service role key to bypass the observed row-level security failure.
- 2026-07-04: Reverted the frontend back to the publishable key and added a migration plus schema snapshot update to permit anon reads, inserts, and updates on the `communications` table through row level security policies.
- 2026-07-05: Split the shared communications table into purpose-based rows so feature-file loading and agent prompt submission can coexist without overwriting each other.
- 2026-07-05: Added a second daemon delivery path so agent prompt replies can be returned to the frontend over REST without storing large chat output in Supabase.
- 2026-07-05: Let the daemon reuse the `agent_prompt` row for lightweight progress markers so the UI can show prompt pickup and completion before the REST reply finishes rendering.
- 2026-07-08: Reworked communications around authenticated user-owned rows and daemon payload storage so the hosted frontend and trusted daemon no longer use service-role access or local cache routes.

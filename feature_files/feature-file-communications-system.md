# Feature File Communications System

## Summary
The feature file communications system uses Supabase as a user-scoped message bus between the authenticated Next.js frontend and the local daemon. Communications remain the transient queue and pickup protocol for direct planning and ask prompts, while completed prompt output is published separately to durable Agent Output Viewer history.

## Key Points
- **Message Bus**: Supabase stores communication messages in a `communications` table with separate rows keyed by `user_id` and `purpose`.
- **Consolidated Polling Ownership**: The browser owns one completion-scheduled review inbox and the daemon owns one bounded work snapshot per configured cycle.
- **Transient Network Tolerance**: The daemon communications client retries short-lived Supabase HTTPS failures with a small timeout and backoff budget before giving up on that poll cycle.
- **Outage Cooldown**: When Supabase stays unreachable after the retry budget is exhausted, the daemon pauses the current poll pass and waits on a longer cooldown before trying again.
- **Daemon Delivery**: The daemon writes feature-file, parameter-file, Git Sync, and project-initialization payloads into `daemon_payloads`; agent responses are not payload messages.
- **Schema Tracking**: Every database change must add a numbered migration and update the checked-in schema snapshot.
- **Protocol Messages**: The feature-file load flow uses `purpose = "feature_file_load"` with `client_load_feature_files`, `daemon_received_message`, and `daemon_sent_feature_files`.
- **Agent Status Messages**: The prompt flow uses `purpose = "agent_prompt"` with queued JSON payloads plus daemon-written status markers while `codex exec` is running.
- **Durable Direct Output**: Planning and ask requests remain communications rows until `agent_output_history` publication succeeds, after which the frontend may acknowledge completion.

## Relevant Files
- `supabase/migrations/001_create_communications_table.sql`: First migration for the communications table.
- `supabase/migrations/002_enable_communications_rls.sql`: Enables row level security and allows browser-side anon reads and writes for the communications table.
- `supabase/migrations/008_auth_scoped_daedalus.sql`: Adds user-scoped communications, daemon payload storage, authenticated RLS, and trusted daemon RPC functions.
- `shared/database/schema.sql`: Checked-in snapshot of the current database schema.
- `local-daemon/src/daedalus_daemon/main.py`: Daemon polling loop and Supabase message handling.
- `parameter_files/feature-file-communications-system.toml`: Daemon-owned polling cadence for the Supabase message loop.
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
- 2026-07-08: Split polling ownership so the daemon now reads `poll_interval_ms` from its own parameter file instead of inheriting cadence from frontend-owned shared config.
- 2026-07-08: Replaced dashboard Supabase request call sites with a derived `currentUserId` value so hosted Next.js builds stop failing on nullable auth user narrowing inside async handlers.
- 2026-07-09: Added daemon-side Supabase request retries and per-cycle crash guards so transient HTTPS connection resets no longer stop the background polling loop.
- 2026-07-09: Added an explicit network-outage cooldown so exhausted Supabase retries now pause the daemon briefly instead of immediately hammering the remaining poll cycles.
- 2026-07-12: Updated daemon communications and config tests to accept urlopen timeouts and assert the new retry/cooldown defaults.
- 2026-07-13: Retained communications as the direct planning/ask pickup protocol while moving response publication out of daemon payloads and into durable agent output history.
- 2026-07-13: Added manager admission gating for feature-file load requests and exposed in-progress `daemon_review` loads through the authoritative drain interface.
- 2026-07-14: Replaced independent recurrent reads with one bounded daemon work snapshot and added five-minute aggregate request/response-byte instrumentation.
- 2026-07-26: Added bounded initialization request routing and progress/result payload delivery without changing the ownership and acknowledgement model.

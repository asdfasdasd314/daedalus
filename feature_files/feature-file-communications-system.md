# Feature File Communications System

## Summary
The feature file communications system uses Supabase as a shared message bus between the Next.js frontend and the local daemon. The frontend polls for the current message and reacts in the UI, while the daemon polls for client requests, scans feature files, and delivers the payload back to the Next.js app through a local API route.

## Key Points
- **Message Bus**: Supabase stores the active communication message in a one-row `communications` table.
- **Polling Loop**: Both the frontend and daemon poll Supabase every `5000` milliseconds.
- **Daemon Delivery**: The daemon POSTs scanned feature-file payloads to the Next.js `/api/feature-files` route.
- **Schema Tracking**: Every database change must add a numbered migration and update the checked-in schema snapshot.
- **Protocol Messages**: The first message flow uses `client_load_feature_files`, `daemon_received_message`, and `daemon_sent_feature_files`.

## Relevant Files
- `shared/supabase_config.json`: Shared Supabase and local frontend connection values.
- `shared/database/migrations/001_create_communications_table.sql`: First migration for the communications table.
- `shared/database/migrations/002_enable_communications_rls.sql`: Enables row level security and allows browser-side anon reads and writes for the communications table.
- `shared/database/schema.sql`: Checked-in snapshot of the current database schema.
- `local-daemon/src/daedalus_daemon/main.py`: Daemon polling loop and Supabase message handling.
- `daedalus-site/app/api/feature-files/route.ts`: Next.js route that receives daemon payloads and serves cached feature-file data.
- `daedalus-site/app/page.tsx`: Frontend dashboard that polls Supabase and renders feature-file data.

## Dev Mode
HACKING

## State Log
- 2026-07-04: Implemented the first Supabase-backed message loop, database artifacts, daemon polling flow, and Next.js feature-file display path for loading local feature files.
- 2026-07-04: Kept the communications path as direct frontend and daemon reads and writes against Supabase, while preserving only the missing-row and stale-poll fixes in the browser client.
- 2026-07-04: Added browser console logging around frontend Supabase message reads and writes so the communications flow can be debugged from the client side.
- 2026-07-04: Switched the frontend communications table reads and writes from the anon key to the Supabase service role key to bypass the observed row-level security failure.
- 2026-07-04: Reverted the frontend back to the publishable key and added a migration plus schema snapshot update to permit anon reads, inserts, and updates on the `communications` table through row level security policies.

# Auth-Scoped Supabase Access

## Summary
Auth-scoped Supabase access moves Daedalus database interaction from global anon/service-role behavior to per-user ownership. The frontend signs users in with Supabase Auth and uses authenticated REST calls, while the trusted local daemon uses `DAEDALUS_USER_ID` plus the public publishable key to call narrow RPC helpers for communication rows and daemon payloads.

## Key Points
- **Authenticated Frontend**: The dashboard gates access behind Supabase Auth and uses the session access token for communications, ventures, and daemon payload reads.
- **Trusted Daemon Scope**: The daemon reads `DAEDALUS_USER_ID`, `SUPABASE_URL`, and `SUPABASE_PUBLISHABLE_KEY` from `.env` and calls RPC functions that scope all operations to that user id.
- **User-Owned Rows**: `communications`, `ventures`, and `daemon_payloads` all carry `user_id`, with authenticated RLS policies limiting browser access to `auth.uid()`.
- **Durable Agent History**: Authenticated users have owner-only select access to `agent_output_history`; direct daemon writes use a narrow user/prompt-keyed RPC and browser mutations have no general policy.
- **Local File Edits**: Parameter-file saves are sent as user-scoped Supabase commands and executed by the daemon locally, keeping hosted frontend code away from local filesystem writes.

## Relevant Files
- `shared/database/migrations/008_auth_scoped_daedalus.sql`: Adds user ownership, authenticated RLS, daemon payload storage, and trusted daemon RPC functions.
- `daedalus-site/app/feature-files-dashboard.tsx`: Hosts the auth gate, Settings tab, authenticated Supabase REST calls, and daemon command writes.
- `local-daemon/src/daedalus_daemon/communications.py`: Uses trusted daemon RPC calls and writes daemon payloads to Supabase.
- `local-daemon/src/daedalus_daemon/main.py`: Handles parameter-file update commands in the daemon polling loop.
- `parameter_files/auth-scoped-supabase-access.toml`: Placeholder parameter file for the auth-scoped access feature.

## Dev Mode
HACKING

## State Log
- 2026-07-08: Initialized the auth-scoped Supabase access feature for per-user database ownership, authenticated frontend calls, and trusted daemon RPC scoping.
- 2026-07-09: Installed the frontend Supabase client dependency into `node_modules` so the Next.js dashboard can resolve `@supabase/supabase-js` at runtime.
- 2026-07-13: Added owner-isolated Agent Output Viewer reads, authenticated search and summaries, and a narrow daemon history upsert without browser insert/update/delete access.

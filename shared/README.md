# Shared Config

This directory stores configuration values that should be available to more than one Daedalus component.

For Supabase, fill in `shared/supabase_config.json` with your real values:

- `supabaseUrl`: Your Supabase project URL.
- `supabasePublishableKey`: The public Supabase publishable key for frontend access and trusted daemon RPC calls.
- `pollIntervalMs`: The shared polling interval for the frontend and daemon.

The file is intentionally checked in for this project setup, so only public project values belong here. Put `DAEDALUS_USER_ID`, `SUPABASE_URL`, and `SUPABASE_PUBLISHABLE_KEY` in the daemon `.env` file for local daemon runs.

Database migrations and the current schema snapshot live in `shared/database/`.

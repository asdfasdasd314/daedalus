# Shared Config

This directory stores configuration values that should be available to more than one Daedalus component.

For Supabase, fill in `shared/supabase_config.json` with your real values:

- `supabaseUrl`: Your Supabase project URL.
- `supabaseAnonKey`: The public anon key for frontend access.
- `supabaseServiceRoleKey`: The service role key for local daemon or backend-style access.
- `frontendBaseUrl`: The local Next.js base URL that the daemon should POST feature-file payloads to.
- `pollIntervalMs`: The shared polling interval for the frontend and daemon.

The file is intentionally checked in for this project setup, so you can paste the values directly and keep both the frontend and local daemon pointed at the same database.

Database migrations and the current schema snapshot live in `shared/database/`.

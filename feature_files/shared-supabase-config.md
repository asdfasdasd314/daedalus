# Shared Supabase Config

## Summary
The shared Supabase config provides one committed location for public frontend and daemon defaults, including the Supabase project URL, publishable key, and polling interval. User identity stays out of the shared file and belongs in the local daemon `.env` as `DAEDALUS_USER_ID`.

## Key Points
- **Shared Source**: Both the frontend and local daemon can read the shared config file for public Supabase connection values.
- **Checked In**: The config is intentionally committed because it now contains only public project values and non-secret defaults.
- **Simple Format**: The values live in JSON so they can be read easily from both TypeScript and Python later.
- **Daemon Identity**: `DAEDALUS_USER_ID`, `SUPABASE_URL`, and `SUPABASE_PUBLISHABLE_KEY` can be placed in `.env` for daemon runs, with `.env` taking priority over shared defaults.

## Relevant Files
- `shared/supabase_config.json`: Canonical shared Supabase URL and key placeholders.
- `shared/README.md`: Short usage notes for where to put the values and what each field is for.
- `feature_files/auth-scoped-supabase-access.md`: Feature ownership notes for authenticated frontend access and trusted daemon scoping.

## Dev Mode
HACKING

## State Log
- 2026-07-04: Added a shared Supabase config file with fill-in placeholders so the frontend and daemon can point at the same database later.
- 2026-07-08: Removed the committed service-role key and narrowed shared config to public Supabase defaults while daemon identity moved to `.env`.

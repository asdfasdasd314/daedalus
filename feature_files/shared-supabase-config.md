# Frontend Supabase Config

## Summary
The frontend Supabase config keeps public browser-facing connection values and the dashboard poll interval inside `daedalus-site`, while the daemon now owns its own environment wiring and polling cadence separately. This file exists to document the ownership shift away from root-level shared config rather than to describe a cross-component source of truth.

## Key Points
- **Frontend Ownership**: `supabaseUrl`, `supabasePublishableKey`, and `pollIntervalMs` now live in `daedalus-site/config/supabase_config.json`.
- **Daemon Independence**: The daemon reads `DAEDALUS_USER_ID`, `SUPABASE_URL`, and `SUPABASE_PUBLISHABLE_KEY` from `.env` and gets its poll cadence from `parameter_files/feature-file-communications-system.toml`.
- **Database-Only Shared Folder**: Root `shared/` no longer stores app config and is reserved for `shared/database/` artifacts only.
- **Checked In Public Values**: The frontend JSON stays committed because it contains only public project values and a UI-owned polling interval.

## Relevant Files
- `daedalus-site/config/supabase_config.json`: Frontend-owned Supabase URL, publishable key, and dashboard poll interval.
- `daedalus-site/lib/frontend-config.ts`: Frontend config loader used by the homepage server component.
- `parameter_files/feature-file-communications-system.toml`: Daemon-owned poll interval for background Supabase polling.
- `feature_files/auth-scoped-supabase-access.md`: Feature ownership notes for authenticated frontend access and trusted daemon scoping.

## Dev Mode
HACKING

## State Log
- 2026-07-04: Added a shared Supabase config file with fill-in placeholders so the frontend and daemon can point at the same database later.
- 2026-07-08: Removed the committed service-role key and narrowed shared config to public Supabase defaults while daemon identity moved to `.env`.
- 2026-07-08: Moved the public Supabase frontend config into `daedalus-site/config/supabase_config.json` and retired the root-level shared config concept so `shared/` can shrink down to database artifacts only.

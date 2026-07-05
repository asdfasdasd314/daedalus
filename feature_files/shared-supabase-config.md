# Shared Supabase Config

## Summary
The shared Supabase config provides one committed location for the frontend and local daemon to read the same Supabase project URL and keys. It keeps the first pass simple by using a checked-in JSON file with placeholder values that can be filled in directly.

## Key Points
- **Shared Source**: Both the frontend and local daemon should treat the shared config file as the single source of truth for Supabase connection values.
- **Checked In**: The config is intentionally committed because this repository is private and the database is only being used as a communication medium between local components.
- **Simple Format**: The values live in JSON so they can be read easily from both TypeScript and Python later.
- **Direct Fill-In**: Placeholder strings are included so the keys and URLs can be pasted in without any extra setup.

## Relevant Files
- `shared/supabase_config.json`: Canonical shared Supabase URL and key placeholders.
- `shared/README.md`: Short usage notes for where to put the values and what each field is for.

## Dev Mode
HACKING

## State Log
- 2026-07-04: Added a shared Supabase config file with fill-in placeholders so the frontend and daemon can point at the same database later.

# Supabase Migration Deployment

## Summary
The local daemon owns the final, serialized Supabase CLI deployment stage for verified Daedalus integration batches. Canonical migrations live in `supabase/migrations/`; `shared/database/schema.sql` remains the readable schema snapshot.

## Key Points
- **Explicit enablement**: Deployment is disabled until an operator verifies the existing remote schema and migration history, records the accepted baseline, and configures the exact repository/project mapping.
- **Safe scope**: Only a repository whose resolved path is paired with `DAEDALUS_SUPABASE_PROJECT_REF` in this feature's parameter file may deploy. Tokens and database credentials are daemon-local environment variables, never TOML values.
- **Forward-only repair**: Resolver agents receive bounded CLI diagnostics and may alter confirmed-unapplied migrations or add a corrective migration; they must never edit an applied migration or run migration-history repair.
- **Serialization and recovery**: A process-local lock serializes pushes per project. A restart blocks retained integrations, and cancellation during a push is treated as an uncertain remote state requiring manual history reconciliation.

## Relevant Files
- `local-daemon/src/daedalus_daemon/migration_deployment.py`: Validation, CLI execution, redaction, diagnostics, and project locking.
- `local-daemon/src/daedalus_daemon/orchestrator.py`: Verified-batch deployment and resolver retry integration.
- `supabase/migrations/`: Canonical ordered Supabase migration history.
- `supabase/config.toml`: Supabase CLI project structure; local link state is ignored.
- `shared/database/README.md`: Bootstrap and operational migration procedure.

## Dev Mode
TESTING

## State Log
- 2026-07-17: Initialized daemon-owned Supabase migration deployment with safe-disabled bootstrap policy and canonical CLI migration ownership.
- 2026-07-17: Implemented allowlisted, per-project serialized CLI preflight/push behavior with redacted diagnostics and integration-resolver retries.

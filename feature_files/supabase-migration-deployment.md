# Supabase Migration Deployment

## Summary
The local daemon owns the final, serialized Supabase CLI deployment stage for verified Daedalus tasks during integration. Canonical migrations live in `supabase/migrations/`; `shared/database/schema.sql` remains the readable schema snapshot.

## Key Points
- **Explicit enablement**: Deployment is disabled until an operator verifies the existing remote schema and migration history, records the accepted baseline, and configures the exact repository/project mapping.
- **Safe scope**: The parameter file selects the sole project ref paired with an exactly resolved repository path; an unlisted repository or multiple configured project refs is blocked with its resolved path in the diagnostic. Tokens and database credentials remain daemon-local environment variables, never TOML values.
- **Forward-only repair**: Resolver agents receive bounded CLI diagnostics and may alter confirmed-unapplied migrations or add a corrective migration; they must never edit an applied migration or run migration-history repair.
- **Serialization and recovery**: A process-local lock serializes pushes per project. A restart blocks retained integrations, and cancellation during a push is treated as an uncertain remote state requiring manual history reconciliation.

## Relevant Files
- `local-daemon/src/daedalus_daemon/migration_deployment.py`: Validation, CLI execution, redaction, diagnostics, and project locking.
- `local-daemon/src/daedalus_daemon/orchestrator.py`: Verified-task deployment and resolver retry integration.
- `supabase/migrations/`: Canonical ordered Supabase migration history.
- `supabase/config.toml`: Supabase CLI project structure; local link state is ignored.
- `shared/database/README.md`: Bootstrap and operational migration procedure.
- `supabase/migrations/039_remove_legacy_batch_persistence.sql`: Guarded forward-only retirement of the drained orchestration persistence layer.

## Dev Mode
TESTING

## State Log
- 2026-07-17: Initialized daemon-owned Supabase migration deployment with safe-disabled bootstrap policy and canonical CLI migration ownership.
- 2026-07-17: Implemented allowlisted, per-project serialized CLI preflight/push behavior with redacted diagnostics and integration-resolver retries.
- 2026-07-17: Added a forward-only daemon-event RPC allowlist repair and made migration telemetry non-blocking so it cannot prevent deployment of the repair.
- 2026-07-17: Added an operator-confirmed baseline script for manually applied migrations 001–036 before pushing migration 037.
- 2026-07-18: Moved deployment telemetry and retry ownership from integration batches to the task being integrated and diffed migrations from the latest primary commit.
- 2026-07-18: Restored the legacy cohort timing setting temporarily during Stage 1 because the running batch daemon validates it on every cycle; migration deployment also requires the daemon process to be launched with its allowlisted project reference.
- 2026-07-18: Made the exact repository-to-project parameter mapping the deployment source of truth, with separate unlisted, ambiguous, and missing-credential blocked states.
- 2026-07-18: Removed the daemon-only credential precheck so migration deployment uses the operator's existing local Supabase CLI session while retaining the exact repository-to-project guard.
- 2026-07-18: Link each temporary task worktree to its allowlisted project before preflight, because Supabase CLI link state is ignored rather than shared across Git worktrees.

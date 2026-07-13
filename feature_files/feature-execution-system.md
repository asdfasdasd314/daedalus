# Feature Execution System

## Summary
The feature execution system lets an authenticated user start a Python feature entry point through the local daemon. The paired parameter file owns the optional `[execution].entry_point`, while the feature file supplies only picker suggestions; the daemon supervises the child process asynchronously and persists lifecycle state and bounded diagnostics in Supabase.

## Key Points
- **Python-only entry points**: The daemon re-reads and validates `[execution].entry_point`, then constructs `python <entry point>` itself; browser requests never supply a launch command.
- **Picker ownership**: The Params tab extracts backticked paths from `## Relevant Files`, includes a stale saved path for correction, and sends add, update, or delete requests through the daemon-only mutation lifecycle.
- **Containment checks**: Project roots must come from feature scanning, and feature and parameter paths must stay within the selected project.
- **Durable lifecycle**: Queued, running, terminal, cancellation, and review acknowledgement states are stored independently from agent tasks.
- **Non-blocking supervision**: Processes run in their own sessions, with output captured by reader threads and polled by the daemon loop.

## Relevant Files
- `local-daemon/src/daedalus_daemon/execution.py`: Validation, process supervision, diagnostics, and cancellation.
- `local-daemon/src/daedalus_daemon/main.py`: Execution-cycle wiring.
- `local-daemon/src/daedalus_daemon/communications.py`: Execution-run RPC wrappers.
- `daedalus-site/app/feature-files-dashboard.tsx`: Feature overlay Run/status/Cancel UI.
- `daedalus-site/app/feature-workspace-utils.ts`: Paired-file and runnable metadata helpers.
- `daedalus-site/app/entry-point-picker.tsx`: Parameter-tab entry-point suggestions and add/update/remove controls.
- `shared/database/migrations/016_feature_execution_runs.sql`: Durable run table, RLS, and RPCs.
- `shared/database/migrations/017_feature_execution_entry_point_metadata.sql`: Entry-point run diagnostic metadata.

## Dev Mode
HACKING

## State Log
- 2026-07-13: Initialized the durable feature execution system ownership boundary.
- 2026-07-13: Implemented daemon-owned feature command validation, durable run lifecycle protocol, and overlay Run/status/Cancel controls; test execution awaits standalone authorization.
- 2026-07-13: Updated daemon configuration fixtures to include the required execution-system parameters and its exposed runtime settings.
- 2026-07-13: Aligned the feature execution supervisor cycle signature with the daemon's shared config-passing cycle runner to prevent repeated invocation errors.
- 2026-07-13: Replaced configurable execution commands with daemon-validated Python entry points and a parameter-file-backed picker.
- 2026-07-13: Normalized execution project roots before containment checks so valid entry points resolve correctly in temporary and symlinked workspaces.
- 2026-07-13: Preserved the configured project-relative entry-point spelling after canonical containment validation for stable Python command previews.

# Local Daemon Manager

## Summary
The local daemon manager is a small Python supervisor and Supabase-backed control plane that owns execution-daemon process lifecycle, restart draining, crash recovery, manager health, and the global work-admission signal.

## Key Points
- **Single Owner**: A heartbeat lease prevents two current manager instances from supervising the same user's execution layer.
- **Graceful Replacement**: Frontend restart requests atomically close admission, wait indefinitely for the database-authoritative drain summary to empty, and remain cancellable until replacement begins.
- **Crash Recovery**: Unexpected child exits close admission and retry replacement without creating a user restart request.
- **Fixed Child**: The manager launches the existing `local-daemon` entrypoint from the repository checkout with the current Python interpreter and no client-supplied command or CLI arguments.
- **Compatibility**: Users without a manager state row continue accepting work until the manager is first registered or a restart is requested.

## Relevant Files
- `local-daemon-manager/src/daedalus_daemon_manager/`: Manager configuration, Supabase communication, and supervision loop.
- `shared/database/migrations/019_local_daemon_manager.sql`: Manager control plane, lifecycle RPCs, drain summary, and admission policies.
- `daedalus-site/app/daemon-manager-panel.tsx`: Workspace manager status and restart controls.
- `parameter_files/local-daemon-manager.toml`: Manager-owned polling, heartbeat, stability, and process timing values.

## Dev Mode
HACKING

## State Log
- 2026-07-13: Initialized the local daemon manager feature for implementation of supervised execution restarts, crash recovery, and shared work admission.
- 2026-07-13: Implemented the lease-backed manager control plane, fixed execution-child supervisor, graceful drain/cancel/replacement flow, crash recovery, frontend controls, and shared admission gating.
